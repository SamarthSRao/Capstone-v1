package main

import (
	"bytes"
	"context"
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
	serviceRate     float64 // mu: requests per minute per server
	slaThreshold    float64 // max probability of waiting
	simulatorURL    string
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

	// Use the Upper Bound (mean + z_score*std) tuned by RL agent
	lambda := float64(resp.UpperBound)
	c := GetRequiredServers(lambda, o.serviceRate, o.slaThreshold)

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

// TargetStatus tracks live metrics and scaling status of the open-source target web app
type TargetStatus struct {
	TargetName     string    `json:"target_name"`
	CurrentRPS     float64   `json:"current_rps"`
	ActiveReplicas int       `json:"active_replicas"`
	PredictedMean  float32   `json:"predicted_mean"`
	PredictedUpper float32   `json:"predicted_upper"`
	RLAction       string    `json:"rl_action"`
	SLAReliability float64   `json:"sla_reliability"`
	LastScaleEvent string    `json:"last_scale_event"`
	UpdatedAt      time.Time `json:"updated_at"`
}

var (
	targetMu     sync.RWMutex
	targetStatus = TargetStatus{
		TargetName:     "Online Boutique (Open-Source Store)",
		CurrentRPS:     0,
		ActiveReplicas: 1,
		SLAReliability: 100.0,
		LastScaleEvent: "System initialized at baseline (1 replica)",
		UpdatedAt:      time.Now(),
	}
	lastScaleDownTime = time.Now()
)

// scaleDockerTargetApp physically scales the open-source target-app containers via Docker CLI or socket
func scaleDockerTargetApp(replicas int) error {
	log.Printf("[Orchestrator Actuator] >>> SCALING TARGET-APP TO %d REPLICAS <<<", replicas)
	cmd := exec.Command("docker", "compose", "up", "-d", "--scale", fmt.Sprintf("target-app=%d", replicas), "--no-recreate")
	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[Orchestrator Actuator] Docker command output / notice: %s (%v)", string(output), err)
	} else {
		log.Printf("[Orchestrator Actuator] Docker scale executed successfully: %s", string(output))
	}
	return nil
}

// startTargetAppMonitor polls live HTTP traffic from Nginx or target app metrics and autonomously adapts
func startTargetAppMonitor(orch *Orchestrator) {
	metricsURL := os.Getenv("TARGET_METRICS_URL")
	if metricsURL == "" {
		metricsURL = "http://nginx-lb:8090/stub_status"
	}

	log.Printf("[Target Monitor] Starting live traffic monitor for: %s", metricsURL)

	client := &http.Client{Timeout: 1500 * time.Millisecond}
	history := make([]float32, 24)
	for i := range history {
		history[i] = 50.0 // Baseline
	}

	var lastTotalReqs int64 = -1
	currentReplicas := 1

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		resp, err := client.Get(metricsURL)
		var currentRPS float64 = 0.0

		if err == nil && resp.StatusCode == 200 {
			buf := new(bytes.Buffer)
			buf.ReadFrom(resp.Body)
			resp.Body.Close()
			bodyStr := buf.String()

			// Parse Nginx stub_status:
			// Active connections: 1
			// server accepts handled requests
			//  10 10 250
			lines := strings.Split(bodyStr, "\n")
			for _, line := range lines {
				fields := strings.Fields(line)
				if len(fields) == 3 {
					if reqs, parseErr := strconv.ParseInt(fields[2], 10, 64); parseErr == nil {
						if lastTotalReqs >= 0 {
							diff := reqs - lastTotalReqs
							if diff >= 0 {
								currentRPS = float64(diff)
							}
						}
						lastTotalReqs = reqs
						break
					}
				}
			}
		} else if resp != nil {
			resp.Body.Close()
		}

		// Shift sliding history window
		copy(history, history[1:])
		history[len(history)-1] = float32(currentRPS)

		// Decide scaling using HybridTimeNet (Bayesian LSTM + Erlang-C + RL)
		servers, predResp, predErr := orch.DecideScaling(history, 0.0, 0.0)
		if predErr != nil {
			continue
		}

		// Clamp servers to realistic range [1, 10]
		if servers < 1 {
			servers = 1
		}
		if servers > 10 {
			servers = 10
		}

		// Autonomous scaling logic with cooldown
		now := time.Now()
		scaleTriggered := false
		var eventMsg string

		if servers > currentReplicas {
			// Proactive scale up: Immediate!
			scaleDockerTargetApp(servers)
			eventMsg = fmt.Sprintf("Proactive surge detected (%.0f RPS): Scaled from %d -> %d replicas", currentRPS, currentReplicas, servers)
			currentReplicas = servers
			scaleTriggered = true
		} else if servers < currentReplicas && now.Sub(lastScaleDownTime) > 15*time.Second {
			// Scale down: Graceful cooldown (15s)
			scaleDockerTargetApp(servers)
			eventMsg = fmt.Sprintf("Traffic subsided (%.0f RPS): Scaled down from %d -> %d replicas", currentRPS, currentReplicas, servers)
			currentReplicas = servers
			lastScaleDownTime = now
			scaleTriggered = true
		}

		targetMu.Lock()
		targetStatus.CurrentRPS = currentRPS
		targetStatus.ActiveReplicas = currentReplicas
		targetStatus.PredictedMean = predResp.Mean
		targetStatus.PredictedUpper = predResp.UpperBound
		targetStatus.RLAction = rlActionLabel(predResp.RlAction)
		if scaleTriggered {
			targetStatus.LastScaleEvent = eventMsg
		}
		targetStatus.UpdatedAt = now
		targetMu.Unlock()
	}
}

func main() {
	simulatorURL := os.Getenv("SIMULATOR_URL")
	if simulatorURL == "" {
		simulatorURL = "http://simulator:8083"
	}

	// Connect to Predictor Service with Retry Logic
	var conn *grpc.ClientConn
	var err error
	for i := 0; i < 30; i++ {
		conn, err = grpc.Dial("predictor:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
		if err == nil {
			client := pb.NewPredictorClient(conn)
			_, err = client.GetPrediction(context.Background(), &pb.PredictionRequest{History: []float32{0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0}})
			if err == nil {
				break
			}
		}
		fmt.Printf("Predictor not ready, retrying in 3s... (%v)\n", err)
		time.Sleep(3 * time.Second)
	}
	if err != nil {
		log.Fatalf("could not connect to predictor after 90s: %v", err)
	}
	defer conn.Close()
	client := pb.NewPredictorClient(conn)

	orch := &Orchestrator{
		predictorClient: client,
		serviceRate:     50.0, // Each server handles 50 RPS
		slaThreshold:    0.01, // 1% target wait probability
		simulatorURL:    simulatorURL,
	}

	// Start background autonomous monitor for open-source target web application
	go startTargetAppMonitor(orch)

	// Expose target application status for frontend and presentation
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
