package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
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
	// LNumerator = c * log(intensity) - log(c!) + log(c / (c - intensity))
	lnum := float64(c)*math.Log(intensity) - logFactorial(c) + math.Log(float64(c)/(float64(c)-intensity))

	// LDenominator = log( sum_{i=0}^{c-1} (intensity^i / i!) + exp(lnum) )
	logTerms := make([]float64, c+1)
	for i := 0; i < c; i++ {
		logTerms[i] = float64(i)*math.Log(intensity) - logFactorial(i)
	}
	logTerms[c] = lnum

	lDenom := logSumExpMulti(logTerms)
	
	// Pw = exp(lnum - lDenom)
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

	// Ensure at least one more server than intensity to avoid division by zero/instability
	if float64(c) <= intensity {
		c++
	}

	for {
		prob := calculateErlangC(c, intensity)
		if prob <= targetWaitProb {
			return c
		}
		c++
		if c > 2000 { // Increased safety break
			return 2000
		}
	}
}

type Orchestrator struct {
	predictorClient pb.PredictorClient
	serviceRate     float64 // mu: requests per minute per server
	slaThreshold    float64 // max probability of waiting
}

func (o *Orchestrator) DecideScaling(history []float32, currentSLA float32, currentWasted float32) (int, float32, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	resp, err := o.predictorClient.GetPrediction(ctx, &pb.PredictionRequest{
		History:            history,
		Timestamp:          time.Now().Format(time.RFC3339),
		SlaViolationRate:   currentSLA,
		WastedCapacity:     currentWasted,
	})
	if err != nil {
		return 0, 0, err
	}

	// Use the Upper Bound (mean + z_score*std) tuned by RL agent
	lambda := float64(resp.UpperBound)
	c := GetRequiredServers(lambda, o.serviceRate, o.slaThreshold)

	return c, resp.UpperBound, nil
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

func main() {
	// Connect to Predictor Service with Retry Logic (Week 14)
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
		serviceRate:     50.0,  // Each server handles 50 RPS
		slaThreshold:    0.01, // 1% target wait probability
	}

	// Internal endpoint for the Simulator to call
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
			// Fallback mock history if empty
			req.History = []float32{4200, 4350, 4180, 4400, 4500, 4600, 4550, 4480, 4520, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000}
		}
		
		servers, upperBound, err := orch.DecideScaling(req.History, req.CurrentSLA, req.CurrentWasted)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

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
			"predicted_upper_bound": upperBound,
		})
	})

	fmt.Println("Go Orchestrator starting on :8082")
	log.Fatal(http.ListenAndServe(":8082", nil))
}
