package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/samarthsrao/capstone/protos/predictor"
)

// Erlang-C helper functions
func factorial(n int) float64 {
	if n == 0 {
		return 1
	}
	res := 1.0
	for i := 1; i <= n; i++ {
		res *= float64(i)
	}
	return res
}

func calculateErlangC(c int, intensity float64) float64 {
	if float64(c) <= intensity {
		return 1.0
	}

	// Numerator: (intensity^c / c!) * (c / (c - intensity))
	numerator := (math.Pow(intensity, float64(c)) / factorial(c)) * (float64(c) / (float64(c) - intensity))

	// Denominator: Sum_{i=0}^{c-1} (intensity^i / i!) + Numerator
	denominator := 0.0
	for i := 0; i < c; i++ {
		denominator += math.Pow(intensity, float64(i)) / factorial(i)
	}
	denominator += numerator

	return numerator / denominator
}

// GetRequiredServers finds the minimum c such that Erlang-C probability < threshold
func GetRequiredServers(lambda float64, mu float64, targetWaitProb float64) int {
	intensity := lambda / mu
	c := int(math.Ceil(intensity))
	if c == 0 {
		c = 1
	}

	for {
		prob := calculateErlangC(c, intensity)
		if prob <= targetWaitProb {
			return c
		}
		c++
		if c > 1000 { // Safety break
			return 1000
		}
	}
}

type Orchestrator struct {
	predictorClient pb.PredictorClient
	serviceRate     float64 // mu: requests per minute per server
	slaThreshold    float64 // max probability of waiting
}

func (o *Orchestrator) DecideScaling(history []float32) (int, float32, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*2)
	defer cancel()

	resp, err := o.predictorClient.GetPrediction(ctx, &pb.PredictionRequest{
		History:   history,
		Timestamp: time.Now().Format(time.RFC3339),
	})
	if err != nil {
		return 0, 0, err
	}

	// Use the Upper Bound (mean + 2*std) for risk-averse provisioning
	lambda := float64(resp.UpperBound)
	c := GetRequiredServers(lambda, o.serviceRate, o.slaThreshold)

	return c, resp.UpperBound, nil
}

func main() {
	// Connect to Predictor Service
	conn, err := grpc.Dial("predictor:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	client := pb.NewPredictorClient(conn)

	orch := &Orchestrator{
		predictorClient: client,
		serviceRate:     50.0,  // Each server handles 50 RPM
		slaThreshold:    0.01, // 1% target wait probability
	}

	// Internal endpoint for the Simulator to call
	http.HandleFunc("/scale", func(w http.ResponseWriter, r *http.Request) {
		// In a real system, we'd take history from a TSDB or the request
		// For simulation, we'll assume the simulator sends the history
		// ... decoding logic omitted for brevity ...
		
		// Mock history for now
		history := []float32{4200, 4350, 4180, 4400, 4500, 4600, 4550, 4480, 4520, 4600, 4700, 4800, 4900, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5700, 5800, 5900, 6000}
		
		servers, upperBound, err := orch.DecideScaling(history)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		fmt.Fprintf(w, "{\"servers\": %d, \"predicted_upper_bound\": %f}", servers, upperBound)
	})

	fmt.Println("Go Orchestrator starting on :8082")
	log.Fatal(http.ListenAndServe(":8082", nil))
}
