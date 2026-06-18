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
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/samarthsrao/capstone/protos/predictor"
)

func logFactorial(n int) float64 {
	res := 0.0
	for i := 1; i <= n; i++ {
		res += math.Log(float64(i))
	}
	return res
}

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

	lnum := float64(c)*math.Log(intensity) - logFactorial(c) + math.Log(float64(c)/(float64(c)-intensity))

	logTerms := make([]float64, c+1)
	for i := 0; i < c; i++ {
		logTerms[i] = float64(i)*math.Log(intensity) - logFactorial(i)
	}
	logTerms[c] = lnum

	lDenom := logSumExpMulti(logTerms)
	return math.Exp(lnum - lDenom)
}

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
	serviceRate     float64
	slaThreshold    float64
	simulatorURL    string
}

func (o *Orchestrator) DecideScaling(history []float32) (int, *pb.PredictionResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := o.predictorClient.GetPrediction(ctx, &pb.PredictionRequest{
		History:   history,
		Timestamp: time.Now().Format(time.RFC3339),
	})
	if err != nil {
		return 0, nil, err
	}

	lambda := float64(resp.UpperBound)
	c := GetRequiredServers(lambda, o.serviceRate, o.slaThreshold)
	return c, resp, nil
}

func (o *Orchestrator) pushPredictionToSimulator(resp *pb.PredictionResponse, requiredServers int) {
	horizon := 12
	meanSeries := make([]float64, horizon)
	upperSeries := make([]float64, horizon)
	lowerSeries := make([]float64, horizon)
	for i := 0; i < horizon; i++ {
		meanSeries[i] = float64(resp.Mean)
		upperSeries[i] = float64(resp.UpperBound)
		lowerSeries[i] = float64(resp.LowerBound)
	}

	payload := map[string]interface{}{
		"predicted_mean":    meanSeries,
		"predicted_upper":   upperSeries,
		"predicted_lower":   lowerSeries,
		"required_servers":  requiredServers,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		fmt.Printf("[Orchestrator] Failed to marshal prediction: %v\n", err)
		return
	}

	client := &http.Client{Timeout: 2 * time.Second}
	res, err := client.Post(o.simulatorURL+"/update-prediction", "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Printf("[Orchestrator] Could not push prediction to Simulator: %v\n", err)
		return
	}
	res.Body.Close()
}

func main() {
	simulatorURL := os.Getenv("SIMULATOR_URL")
	if simulatorURL == "" {
		simulatorURL = "http://simulator:8083"
	}

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
		serviceRate:     50.0,
		slaThreshold:    0.01,
		simulatorURL:    simulatorURL,
	}

	http.HandleFunc("/scale", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			History []float32 `json:"history"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if len(req.History) == 0 {
			req.History = []float32{50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50}
		}

		servers, predResp, err := orch.DecideScaling(req.History)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		orch.pushPredictionToSimulator(predResp, servers)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"servers":               servers,
			"predicted_upper_bound": predResp.UpperBound,
			"predicted_mean":        predResp.Mean,
			"predicted_lower_bound": predResp.LowerBound,
		})
	})

	fmt.Println("Go Orchestrator starting on :8082")
	log.Fatal(http.ListenAndServe(":8082", nil))
}
