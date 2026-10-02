package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/samarthsrao/capstone/protos/predictor"
)

// logFactorial calculates the log of n!
func logFactorial(n int) float64 {
	res := 0.0
	for i := 1; i <= n; i++ {
		res += math.Log(float64(i))
	}
	return res
}

// logSumExpMulti computes log(sum(exp(x_i))) in a stable way
func logSumExpMulti(terms []float64) float64 {
	if len(terms) == 0 {
		return -math.MaxFloat64
	}
	max := terms[0]
	for _, v := range terms {
		if v > max {
			max = v
		}
	}
	if math.IsInf(max, 1) || math.IsInf(max, -1) {
		return max
	}
	sum := 0.0
	for _, v := range terms {
		sum += math.Exp(v - max)
	}
	return max + math.Log(sum)
}

func calculateErlangC(c int, intensity float64) float64 {
	if float64(c) <= intensity {
		return 1.0
	}

	// Use log-space to avoid overflow
	lnum := float64(c)*math.Log(intensity) - logFactorial(c) + math.Log(float64(c)/(float64(c)-intensity))

	logTerms := make([]float64, c+1)
	for i := 0; i < c; i++ {
		logTerms[i] = float64(i)*math.Log(intensity) - logFactorial(i)
	}
	logTerms[c] = lnum

	lDenom := logSumExpMulti(logTerms)
	return math.Exp(lnum - lDenom)
}

// GetRequiredServers finds the minimum c such that Erlang-C probability < threshold
func GetRequiredServers(lambda float64, mu float64, targetWaitProb float64) int {
	if lambda <= 0 {
		return 1
	}
	intensity := lambda / mu
	c := int(math.Ceil(intensity))
	if c <= 0 {
		c = 1
	}

	if float64(c) <= intensity {
		c++
	}

	for {
		prob := calculateErlangC(c, intensity)
		if prob <= targetWaitProb {
			return c
		}
		c++
		if c > 2000 {
			return 2000
		}
	}
}

type Orchestrator struct {
	predictorClient pb.PredictorClient
	// serviceRate is mu in requests per second per replica. It is not a
	// per-minute figure; lambda from the predictor is also requests/second.
	serviceRate   float64
	slaThreshold  float64 // max probability of waiting (classic Erlang-C path)
	simulatorURL  string
	capacityModel bool // AKS path: ceil(lambda/mu) with a one-pod margin
	minReplicas   int
	maxReplicas   int
	leadTime      time.Duration
	scalePolicy   ScalePolicy
	forecastGuard ForecastGuard
	prescaleCfg   PrescaleConfig
	prescaleState PrescaleState
}

func (o *Orchestrator) DecideScaling(history []float32, currentSLA float32, currentWasted float32) (int, *pb.PredictionResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	resp, err := o.predictorClient.GetPrediction(ctx, &pb.PredictionRequest{
		History:          history,
		Timestamp:        time.Now().Format(time.RFC3339),
		SlaViolationRate: currentSLA,
		WastedCapacity:   currentWasted,
	})
	if err != nil {
		return 0, nil, err
	}

	// Use the Upper Bound (mean + z_score*std) tuned by RL agent.
	// The autonomous monitor may further project this across pod startup;
	// see leadAdjustedLambda. This function stays a pure function of the
	// prediction so /scale (simulator) and the monitor can share it.
	lambda := float64(resp.UpperBound)
	var c int
	if o.capacityModel {
		c = ReplicasForLoad(lambda, o.serviceRate, o.minReplicas, o.maxReplicas)
	} else {
		c = GetRequiredServers(lambda, o.serviceRate, o.slaThreshold)
	}

	return c, resp, nil
}

func rlActionLabel(action int32) string {
	switch action {
	case 0:
		return "TIGHTEN -0.5"
	case 1:
		return "TIGHTEN -0.1"
	case 2:
		return "HOLD"
	case 3:
		return "WIDEN +0.5"
	case 4:
		return "PANIC +2.0"
	default:
		return "UNKNOWN"
	}
}

// forwardPredictionToSimulator POSTs prediction bounds to the Go Simulator (HT-308).
// Timeout is capped at 2s so a slow simulator never blocks /scale responses.
func (o *Orchestrator) forwardPredictionToSimulator(
	mean, upper, lower float64,
	servers int,
	pred *pb.PredictionResponse,
) {
	client := &http.Client{Timeout: 2 * time.Second}

	horizon := 12
	meanSeries := make([]float64, horizon)
	upperSeries := make([]float64, horizon)
	lowerSeries := make([]float64, horizon)
	rawSeries := make([]float64, horizon)
	for i := 0; i < horizon; i++ {
		meanSeries[i] = mean
		upperSeries[i] = upper
		lowerSeries[i] = lower
		rawSeries[i] = float64(pred.RawMlMean)
	}

	payload := map[string]interface{}{
		"predicted_mean":      meanSeries,
		"predicted_upper":     upperSeries,
		"predicted_lower":     lowerSeries,
		"raw_ml_mean":         rawSeries,
		"required_servers":    servers,
		"z_score":             pred.ZScore,
		"rl_action":           pred.RlAction,
		"rl_action_label":     rlActionLabel(pred.RlAction),
		"error_ratio":         pred.ErrorRatio,
		"std_dev":             pred.StdDev,
		"state_variance_norm": pred.StateVarianceNorm,
		"state_sla":           pred.StateSla,
		"state_waste_norm":    pred.StateWasteNorm,
		"state_trend":         pred.StateTrend,
		"state_hour_sin":      pred.StateHourSin,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[Orchestrator] Failed to marshal prediction: %v", err)
		return
	}

	resp, err := client.Post(o.simulatorURL+"/update-prediction", "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("[Orchestrator] Error forwarding predictions to simulator: %v", err)
		return
	}
	defer resp.Body.Close()
}

// scaleZopdevDeployment sends a request to the real zopdev/api to scale the cluster
func (o *Orchestrator) scaleZopdevDeployment(envID string, deploymentName string, replicas int) error {
	url := fmt.Sprintf("http://localhost:8000/environments/%s/deploymentspace/scale", envID)

	payload := map[string]interface{}{
		"deployment": deploymentName,
		"replicas":   replicas,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("failed to scale zopdev deployment, status: %d", resp.StatusCode)
	}

	log.Printf("Successfully scaled Zopdev deployment %s to %d replicas", deploymentName, replicas)
	return nil
}

// TargetStatus tracks live metrics and scaling status of the target web app.
// Field names match the keys the dashboard already reads from the simulator
// (current_rps, predicted_upper, rl_action as an int, rl_action_label) plus
// the replica pair the AKS demo needs.
type TargetStatus struct {
	TargetName      string    `json:"target_name"`
	Live            bool      `json:"live"`
	Status          string    `json:"status"`
	CurrentRPS      float64   `json:"current_rps"`
	ActiveReplicas  int       `json:"active_replicas"`
	DesiredReplicas int       `json:"desired_replicas"`
	Scaling         string    `json:"scaling"`
	PredictedMean   float32   `json:"predicted_mean"`
	PredictedUpper  float32   `json:"predicted_upper"`
	PredictedLower  float32   `json:"predicted_lower"`
	RawMlMean       float32   `json:"raw_ml_mean"`
	ForecastLeadRPS float64   `json:"forecast_lead_rps"`
	ScaleRule       string    `json:"scale_rule"`
	StdDev          float32   `json:"std_dev"`
	ZScore          float32   `json:"z_score"`
	ErrorRatio      float32   `json:"error_ratio"`
	RLAction        int32     `json:"rl_action"`
	RLActionLabel   string    `json:"rl_action_label"`
	SLAReliability  float64   `json:"sla_reliability"`
	SLAViolations   int       `json:"violations"`
	LastScaleEvent  string    `json:"last_scale_event"`
	UpdatedAt       time.Time `json:"updated_at"`
}

var (
	targetMu     sync.RWMutex
	targetStatus = TargetStatus{
		TargetName:      "Online Boutique (Open-Source Store)",
		Live:            false,
		Status:          "IDLE",
		CurrentRPS:      0,
		ActiveReplicas:  1,
		DesiredReplicas: 1,
		Scaling:         "hold",
		SLAReliability:  100.0,
		LastScaleEvent:  "System initialized at baseline (1 replica)",
		UpdatedAt:       time.Now(),
	}
	// Last successful scale (up or down). Scale-down is blocked until
	// ScaleDownStabilization has elapsed; scale-up is not.
	lastScaleChange = time.Now()
)

// scaleDockerTargetApp physically scales the open-source target-app containers via Docker CLI or socket
func scaleDockerTargetApp(replicas int) error {
	log.Printf("[Orchestrator Docker Actuator] >>> SCALING TARGET-APP TO %d REPLICAS <<<", replicas)
	cmd := exec.Command("docker", "compose", "up", "-d", "--scale", fmt.Sprintf("target-app=%d", replicas), "--no-recreate")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[Orchestrator Docker Actuator] Docker command failed: %s (%v)", string(output), err)
		return fmt.Errorf("docker scale: %w", err)
	}
	log.Printf("[Orchestrator Docker Actuator] Docker scale executed successfully: %s", string(output))
	return nil
}

func k8sTarget() (namespace, deployment string) {
	namespace = os.Getenv("K8S_NAMESPACE")
	if namespace == "" {
		namespace = "capstone"
	}
	deployment = os.Getenv("K8S_DEPLOYMENT")
	if deployment == "" {
		deployment = "target-app"
	}
	return namespace, deployment
}

// inClusterClient returns an HTTP client authenticated with the pod service
// account. ok is false when the process is not running inside a cluster.
func inClusterClient() (client *http.Client, hostport, token string, ok bool) {
	tokenBytes, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/token")
	if err != nil {
		return nil, "", "", false
	}
	k8sHost := os.Getenv("KUBERNETES_SERVICE_HOST")
	k8sPort := os.Getenv("KUBERNETES_SERVICE_PORT")
	if k8sHost == "" {
		k8sHost = "kubernetes.default.svc"
		k8sPort = "443"
	}
	caCert, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt")
	caCertPool := x509.NewCertPool()
	if err == nil {
		caCertPool.AppendCertsFromPEM(caCert)
	}
	client = &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: caCertPool},
		},
	}
	return client, k8sHost + ":" + k8sPort, string(tokenBytes), true
}

func deploymentScaleURL(hostport, namespace, deployment string) string {
	return fmt.Sprintf("https://%s/apis/apps/v1/namespaces/%s/deployments/%s/scale", hostport, namespace, deployment)
}

// getKubernetesReplicas reads spec.replicas from the live Deployment so a
// failed scale, a manual edit, or a restart cannot leave the loop believing
// a replica count it never applied.
func getKubernetesReplicas() (int, error) {
	namespace, deployment := k8sTarget()
	if client, hostport, token, ok := inClusterClient(); ok {
		req, err := http.NewRequest(http.MethodGet, deploymentScaleURL(hostport, namespace, deployment), nil)
		if err != nil {
			return 0, err
		}
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			return 0, err
		}
		defer resp.Body.Close()
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		if resp.StatusCode >= 300 {
			return 0, fmt.Errorf("k8s api get scale failed with status %d: %s", resp.StatusCode, buf.String())
		}
		return parseDeploymentScale(buf.Bytes())
	}

	cmd := exec.Command("kubectl", "get", "deployment", deployment, "-n", namespace, "-o", "json")
	out, err := cmd.Output()
	if err != nil {
		return 0, err
	}
	return parseDeploymentScale(out)
}

// scaleKubernetesDeployment scales the target Kubernetes deployment via in-cluster service account or kubectl
func scaleKubernetesDeployment(replicas int) error {
	namespace, deployment := k8sTarget()

	log.Printf("[Orchestrator K8s Actuator] >>> PROACTIVELY SCALING K8S DEPLOYMENT %s/%s TO %d PODS <<<", namespace, deployment, replicas)

	if client, hostport, token, ok := inClusterClient(); ok {
		payload := fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas)
		req, err := http.NewRequest(http.MethodPatch, deploymentScaleURL(hostport, namespace, deployment), bytes.NewBufferString(payload))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/merge-patch+json")
		req.Header.Set("Authorization", "Bearer "+token)

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[Orchestrator K8s Actuator] In-cluster scale request error: %v", err)
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode >= 300 {
			buf := new(bytes.Buffer)
			buf.ReadFrom(resp.Body)
			log.Printf("[Orchestrator K8s Actuator] K8s API scale error (HTTP %d): %s", resp.StatusCode, buf.String())
			return fmt.Errorf("k8s api scale failed with status %d", resp.StatusCode)
		}

		log.Printf("[Orchestrator K8s Actuator] Successfully scaled %s/%s to %d replicas via K8s API", namespace, deployment, replicas)
		return nil
	}

	// Fallback to kubectl if running externally with kubeconfig
	cmd := exec.Command("kubectl", "scale", fmt.Sprintf("deployment/%s", deployment), fmt.Sprintf("--replicas=%d", replicas), "-n", namespace)
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[Orchestrator K8s Actuator] kubectl scale failed: %s (%v)", string(out), err)
		return err
	}
	log.Printf("[Orchestrator K8s Actuator] kubectl scale success: %s", string(out))
	return nil
}

// scaleTargetApp routes scaling to Kubernetes (if in cluster or enabled) or Docker
func scaleTargetApp(replicas int) error {
	if os.Getenv("KUBERNETES_ENABLED") == "true" || os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return scaleKubernetesDeployment(replicas)
	}
	return scaleDockerTargetApp(replicas)
}

// autonomousScalerEnabled is true on AKS/kind, where this process is the only
// caller of GetPrediction. The DQN z-score is one piece of process-wide state
// inside the predictor. Leaving the monitor running next to the simulator's
// POST /scale (local docker compose) steps that state twice per tick, so the
// monitor stays off unless Kubernetes mode or an explicit metrics URL is set.
func autonomousScalerEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AUTONOMOUS_SCALER"))) {
	case "false", "0", "no":
		return false
	case "true", "1", "yes":
		return true
	}
	if os.Getenv("KUBERNETES_ENABLED") == "true" || os.Getenv("TARGET_METRICS_URL") != "" || os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return true
	}
	return false
}

// startTargetAppMonitor polls nginx stub_status and scales the target Deployment.
// One tick is one second: that is also the history sample period.
func startTargetAppMonitor(orch *Orchestrator) {
	metricsURL := os.Getenv("TARGET_METRICS_URL")
	if metricsURL == "" {
		metricsURL = "http://nginx-metrics:8091/stub_status"
	}

	log.Printf("[Target Monitor] Starting live traffic monitor for: %s (service rate %.0f RPS/pod, scale-down every %s by %d)",
		metricsURL, orch.serviceRate, orch.scalePolicy.ScaleDownStabilization, orch.scalePolicy.ScaleDownStep)

	client := &http.Client{Timeout: 1500 * time.Millisecond}
	history := make([]float32, 24)
	var lastTotalReqs int64 = -1
	var lastSample time.Time
	seeded := false
	currentReplicas := orch.minReplicas
	if currentReplicas < 1 {
		currentReplicas = 1
	}
	var fb feedbackWindow
	fb.size = 30
	var demand demandTrack
	violations := 0
	scrapeMisses := 0

	targetMu.Lock()
	targetStatus.Live = true
	targetStatus.Status = "LIVE"
	targetStatus.ActiveReplicas = currentReplicas
	targetStatus.DesiredReplicas = currentReplicas
	targetMu.Unlock()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for now := range ticker.C {
		resp, err := client.Get(metricsURL)
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			// A missed scrape is not zero traffic. Pushing 0 would make the
			// forecast collapse and would step the RL agent on a lie.
			scrapeMisses++
			if scrapeMisses == 1 || scrapeMisses%15 == 0 {
				log.Printf("[Target Monitor] metrics scrape failed (%d): %v", scrapeMisses, err)
			}
			continue
		}
		scrapeMisses = 0
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		resp.Body.Close()

		total, ok := parseStubStatusRequests(buf.String())
		if !ok {
			log.Printf("[Target Monitor] stub_status had no request counter")
			continue
		}

		// The first scrape only records the counter. A zero-length delta is
		// not a traffic sample, and a history of zeros makes the model
		// invent a surge before the demo starts.
		if lastSample.IsZero() {
			lastTotalReqs = total
			lastSample = now
			continue
		}
		currentRPS := requestsPerSecond(lastTotalReqs, total, now.Sub(lastSample))
		lastTotalReqs = total
		lastSample = now

		if !seeded {
			for i := range history {
				history[i] = float32(currentRPS)
			}
			seeded = true
		} else {
			copy(history, history[1:])
			history[len(history)-1] = float32(currentRPS)
		}

		// Resync from the Deployment before deciding. spec.replicas is what
		// we last asked for (or what a human set); do not invent a count.
		if live, syncErr := getKubernetesReplicas(); syncErr != nil {
			log.Printf("[Target Monitor] replica resync skipped: %v", syncErr)
		} else if live >= 1 {
			currentReplicas = live
		}

		slaInst, wasteInst := capacityFeedback(currentRPS, currentReplicas, orch.serviceRate)
		if slaInst > 0 {
			violations++
		}
		slaAvg, wasteAvg := fb.push(float64(slaInst), float64(wasteInst))

		servers, predResp, predErr := orch.DecideScaling(history, slaAvg, wasteAvg)
		if predErr != nil {
			log.Printf("[Target Monitor] prediction failed: %v", predErr)
			continue
		}

		// Upper-bound noise stays inside the idle cap. A scale-up comes from
		// the forecast mean, from live RPS once it crosses capacity, or from
		// a slope that has held while the smoothed rate is already near
		// capacity. scaleRule is idle-guard, slope, live-capacity,
		// forecast-persistence, or forecast-margin.
		scaleRule := ruleIdleGuard
		if orch.capacityModel {
			slope := recentSlope(history, orch.prescaleCfg.SlopeWindow)
			capacity := float64(currentReplicas) * orch.serviceRate
			signal := decideScaleRate(float64(predResp.UpperBound), float64(predResp.RawMlMean), currentRPS, slope, capacity, orch.leadTime, orch.forecastGuard, orch.prescaleCfg, &orch.prescaleState)
			scaleRule = signal.Rule
			servers = ReplicasForLoad(signal.Lambda, orch.serviceRate, orch.minReplicas, orch.maxReplicas)
			// Hold the extra pod through a dip unless the whole stabilization
			// window's forecast mean and live RPS fit in fewer pods.
			window := int(orch.scalePolicy.ScaleDownStabilization / time.Second)
			peak := demand.push(float64(predResp.RawMlMean), signal.SizingRPS, window)
			servers = limitScaleDown(currentReplicas, servers, peak, orch.serviceRate, orch.minReplicas, orch.maxReplicas)
		}

		decision := applyScalePolicy(currentReplicas, servers, now.Sub(lastScaleChange), orch.scalePolicy)
		eventMsg := ""
		if decision.Direction == "up" || decision.Direction == "down" {
			from := currentReplicas
			if scaleErr := scaleTargetApp(decision.Next); scaleErr != nil {
				eventMsg = fmt.Sprintf("Scale %s %d -> %d failed: %v", decision.Direction, from, decision.Next, scaleErr)
				log.Printf("[Target Monitor] %s", eventMsg)
				decision.Direction = "hold"
				decision.Next = from
			} else {
				updated, _ := replicaCountAfterScale(from, decision.Next, nil)
				currentReplicas = updated
				lastScaleChange = now
				if decision.Direction == "up" {
					eventMsg = fmt.Sprintf("rule=%s forecast %.0f live %.0f upper %.0f: scaled %d -> %d replicas", scaleRule, predResp.RawMlMean, currentRPS, predResp.UpperBound, from, currentReplicas)
				} else {
					eventMsg = fmt.Sprintf("rule=%s traffic %.0f RPS: stepped down %d -> %d replicas", scaleRule, currentRPS, from, currentReplicas)
				}
				log.Printf("[Target Monitor] %s", eventMsg)
			}
		}

		reliability := 100 * (1 - float64(slaAvg))
		if reliability < 0 {
			reliability = 0
		}

		targetMu.Lock()
		targetStatus.Live = true
		targetStatus.Status = "LIVE"
		targetStatus.CurrentRPS = currentRPS
		targetStatus.ActiveReplicas = currentReplicas
		targetStatus.DesiredReplicas = decision.Next
		if decision.Direction == "hold" && servers != currentReplicas {
			// Forecast wants a different size, but the stabilization window
			// or a failed call is holding the live count.
			targetStatus.DesiredReplicas = servers
		}
		targetStatus.Scaling = decision.Direction
		targetStatus.PredictedMean = predResp.RawMlMean
		targetStatus.PredictedUpper = predResp.UpperBound
		targetStatus.PredictedLower = predResp.LowerBound
		targetStatus.RawMlMean = predResp.RawMlMean
		targetStatus.ForecastLeadRPS = float64(predResp.RawMlMean) - currentRPS
		targetStatus.ScaleRule = scaleRule
		targetStatus.StdDev = predResp.StdDev
		targetStatus.ZScore = predResp.ZScore
		targetStatus.ErrorRatio = predResp.ErrorRatio
		targetStatus.RLAction = predResp.RlAction
		targetStatus.RLActionLabel = rlActionLabel(predResp.RlAction)
		targetStatus.SLAReliability = reliability
		targetStatus.SLAViolations = violations
		if eventMsg != "" {
			targetStatus.LastScaleEvent = eventMsg
		}
		targetStatus.UpdatedAt = now
		targetMu.Unlock()
	}
}

func envInt(key string, def int) int {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		log.Printf("[Orchestrator] ignoring %s=%q (%v)", key, v, err)
		return def
	}
	return n
}

func envFloat(key string, def float64) float64 {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return def
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		log.Printf("[Orchestrator] ignoring %s=%q (%v)", key, v, err)
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "y":
		return true
	case "0", "false", "no", "n":
		return false
	default:
		return def
	}
}

func main() {
	simulatorURL := os.Getenv("SIMULATOR_URL")
	if simulatorURL == "" {
		simulatorURL = "http://simulator:8083"
	}

	// PREDICTOR_URL was previously ignored; grpc.Dial was hardcoded.
	predictorAddr := normalizePredictorTarget(os.Getenv("PREDICTOR_URL"))

	// Connect to Predictor Service with Retry Logic.
	// A single readiness RPC steps the DQN z-score once at boot. After that,
	// only one controller (the monitor on AKS, or POST /scale for the local
	// simulator) should keep calling GetPrediction.
	var conn *grpc.ClientConn
	var err error
	for i := 0; i < 30; i++ {
		conn, err = grpc.Dial(predictorAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			client := pb.NewPredictorClient(conn)
			_, err = client.GetPrediction(context.Background(), &pb.PredictionRequest{History: []float32{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}})
			if err == nil {
				break
			}
			conn.Close()
		}
		fmt.Printf("Predictor not ready at %s, retrying in 3s... (%v)\n", predictorAddr, err)
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		log.Fatalf("could not connect to predictor %s after 90s: %v", predictorAddr, err)
	}
	defer conn.Close()
	client := pb.NewPredictorClient(conn)

	k8sMode := os.Getenv("KUBERNETES_ENABLED") == "true" || os.Getenv("KUBERNETES_SERVICE_HOST") != ""
	capacityModel := envBool("CAPACITY_MODEL", k8sMode)
	// Classic simulator path: 50 RPS per server (Erlang-C search, uncapped here).
	// AKS path: 200 RPS per pod so uncertainty of ~300 RPS stays at 1-2 replicas.
	serviceRate := 50.0
	if capacityModel {
		serviceRate = 200.0
	}
	if v := os.Getenv("SERVICE_RATE_RPS"); v != "" {
		if parsed, perr := strconv.ParseFloat(v, 64); perr == nil && parsed > 0 {
			serviceRate = parsed
		}
	}
	minReplicas := envInt("MIN_REPLICAS", 1)
	maxReplicas := envInt("MAX_REPLICAS", 10)
	if !capacityModel && os.Getenv("MAX_REPLICAS") == "" {
		maxReplicas = 2000 // classic GetRequiredServers has its own ceiling
	}
	leadTime := time.Duration(envInt("FORECAST_LEAD_SECONDS", 20)) * time.Second
	// 50 RPS of headroom is under the 200 RPS pod size, so an idle upper
	// bound of a few hundred RPS cannot by itself request a second pod.
	guard := ForecastGuard{
		FlatHeadroomRPS: envFloat("FLAT_HEADROOM_RPS", 50),
		RisingSlope:     envFloat("RISING_SLOPE_RPS", 5),
		RisingFraction:  envFloat("RISING_SLOPE_FRACTION", 0.01),
	}.normalized()
	// Margin cap and slope headroom stay far below one pod (200 RPS).
	// An idle forecast mean near 70 plus that margin cannot clear capacity,
	// and a slope scale-up is sized from the live extrapolation, not the
	// raw upper bound.
	prescale := PrescaleConfig{
		PersistTicks:     envInt("PRESCALE_PERSIST_TICKS", 3),
		MarginCapRPS:     envFloat("PRESCALE_MARGIN_CAP_RPS", 40),
		SmoothAlpha:      envFloat("PRESCALE_SMOOTH_ALPHA", 0.2),
		PrescaleFraction: envFloat("PRESCALE_CAPACITY_FRACTION", 0.80),
		MarginFraction:   envFloat("PRESCALE_MARGIN_FRACTION", 0.20),
		LiveMedianTicks:  envInt("LIVE_MEDIAN_TICKS", 3),
		SlopeSustain:     envInt("SLOPE_SUSTAIN_TICKS", 3),
		SlopeWindow:      envInt("SLOPE_WINDOW_TICKS", 15),
		CapacityFraction: envFloat("CAPACITY_FRACTION", 0.70),
		SlopeHeadroom:    envFloat("SLOPE_HEADROOM_RPS", 40),
		SlopeSizeMargin:  envFloat("SLOPE_SIZE_MARGIN_RPS", 80),
	}.normalized()
	policy := ScalePolicy{
		MinReplicas:            minReplicas,
		MaxReplicas:            maxReplicas,
		ScaleDownStabilization: time.Duration(envInt("SCALE_DOWN_STABILIZATION_SEC", 100)) * time.Second,
		ScaleDownStep:          envInt("SCALE_DOWN_STEP", 1),
	}
	policy = normalizeScalePolicy(policy)

	orch := &Orchestrator{
		predictorClient: client,
		serviceRate:     serviceRate,
		slaThreshold:    0.01,
		simulatorURL:    simulatorURL,
		capacityModel:   capacityModel,
		minReplicas:     policy.MinReplicas,
		maxReplicas:     policy.MaxReplicas,
		leadTime:        leadTime,
		scalePolicy:     policy,
		forecastGuard:   guard,
		prescaleCfg:     prescale,
	}
	if v := os.Getenv("SLA_THRESHOLD"); v != "" {
		if parsed, perr := strconv.ParseFloat(v, 64); perr == nil && parsed > 0 && parsed < 1 {
			orch.slaThreshold = parsed
		}
	}

	log.Printf("[Orchestrator] predictor=%s capacity_model=%v service_rate=%.0f rps/replica replicas=[%d,%d] lead=%s scale_down=%s step=%d flat_headroom=%.0f rising_slope=%.1f rising_frac=%.3f slope_sustain=%d slope_window=%d capacity_frac=%.2f prescale_frac=%.2f margin_frac=%.2f live_median=%d slope_headroom=%.0f slope_size_margin=%.0f prescale_ticks=%d margin_cap=%.0f autonomous=%v",
		predictorAddr, capacityModel, serviceRate, policy.MinReplicas, policy.MaxReplicas, leadTime, policy.ScaleDownStabilization, policy.ScaleDownStep, guard.FlatHeadroomRPS, guard.RisingSlope, guard.RisingFraction, prescale.SlopeSustain, prescale.SlopeWindow, prescale.CapacityFraction, prescale.PrescaleFraction, prescale.MarginFraction, prescale.LiveMedianTicks, prescale.SlopeHeadroom, prescale.SlopeSizeMargin, prescale.PersistTicks, prescale.MarginCapRPS, autonomousScalerEnabled())

	// On AKS this is the only GetPrediction caller, so the DQN sees one
	// stream of SLA/waste feedback. Local compose leaves it off and uses /scale.
	if autonomousScalerEnabled() {
		go startTargetAppMonitor(orch)
	}

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Expose target application status for the dashboard (same-origin via nginx).
	http.HandleFunc("/api/target/status", func(w http.ResponseWriter, r *http.Request) {
		targetMu.RLock()
		defer targetMu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(targetStatus)
	})

	http.HandleFunc("/scale", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			History        []float32 `json:"history"`
			CurrentSLA     float32   `json:"current_sla"`
			CurrentWasted  float32   `json:"current_wasted"`
			EnvID          string    `json:"env_id"`
			DeploymentName string    `json:"deployment_name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if len(req.History) == 0 {
			req.History = []float32{4200, 4350, 4180, 4400, 4500, 4600, 4550, 4480, 4520, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000}
		}

		servers, predResp, err := orch.DecideScaling(req.History, req.CurrentSLA, req.CurrentWasted)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// HT-308: forward prediction band + RL telemetry to simulator
		orch.forwardPredictionToSimulator(
			float64(predResp.Mean),
			float64(predResp.UpperBound),
			float64(predResp.LowerBound),
			servers,
			predResp,
		)

		// Integration with zopdev/api
		if req.EnvID != "" && req.DeploymentName != "" {
			err = orch.scaleZopdevDeployment(req.EnvID, req.DeploymentName, servers)
			if err != nil {
				log.Printf("Warning: Zopdev scaling failed: %v\n", err)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"servers":               servers,
			"predicted_upper_bound": predResp.UpperBound,
			"predicted_mean":        predResp.Mean,
			"predicted_lower_bound": predResp.LowerBound,
			"z_score":               predResp.ZScore,
			"rl_action":             predResp.RlAction,
			"rl_action_label":       rlActionLabel(predResp.RlAction),
			"raw_ml_mean":           predResp.RawMlMean,
			"error_ratio":           predResp.ErrorRatio,
		})
	})

	fmt.Println("Go Orchestrator starting on :8082 (with Autonomous Target App Scaler)")
	log.Fatal(http.ListenAndServe(":8082", nil))
}
