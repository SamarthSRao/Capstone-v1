package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

var (
	mu          sync.Mutex
	requestLog  []time.Time
	dropped     int
	served      int
)

func cleanupLog() {
	mu.Lock()
	defer mu.Unlock()
	cutoff := time.Now().Add(-24 * time.Second) // Keep last 24 seconds
	var newLog []time.Time
	for _, t := range requestLog {
		if t.After(cutoff) {
			newLog = append(newLog, t)
		}
	}
	requestLog = newLog
}

func reportToOrchestrator() {
	for {
		time.Sleep(1 * time.Second)
		cleanupLog()

		mu.Lock()
		now := time.Now()
		// Count requests per second for the last 24 seconds
		history := make([]float32, 24)
		for i := 0; i < 24; i++ {
			start := now.Add(time.Duration(-24+i) * time.Second)
			end := start.Add(1 * time.Second)
			count := 0
			for _, t := range requestLog {
				if (t.After(start) || t.Equal(start)) && t.Before(end) {
					count++
				}
			}
			// Scale the count up so the orchestrator has meaningful data for prediction
			history[i] = float32(count * 50) 
		}
		
		var sla float32 = 0
		if (served + dropped) > 0 {
			sla = float32(dropped) / float32(served+dropped)
		}
		mu.Unlock()

		payload := map[string]interface{}{
			"history":         history,
			"current_sla":     sla,
			"current_wasted":  0.0,
			"env_id":          "demo-env",
			"deployment_name": "dummy-ecommerce",
		}
		data, _ := json.Marshal(payload)
		resp, err := http.Post("http://orchestrator:8082/scale", "application/json", bytes.NewBuffer(data))
		if err != nil {
			log.Printf("Error reporting to orchestrator: %v\n", err)
		} else {
			resp.Body.Close()
		}
	}
}

func main() {
	go reportToOrchestrator()

	http.HandleFunc("/api/checkout", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requestLog = append(requestLog, time.Now())
		served++
		mu.Unlock()

		time.Sleep(time.Duration(rand.Intn(50)) * time.Millisecond)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok": true, "message": "Order placed successfully"}`))
	})

	fmt.Println("Dummy Ecommerce starting on :8084")
	log.Fatal(http.ListenAndServe(":8084", nil))
}
