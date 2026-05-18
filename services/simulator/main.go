package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

type Request struct {
	ID        int
	StartTime time.Time
}

type Server struct {
	ID        int
	IsActive  bool
	ActiveAt  time.Time
}

type Simulator struct {
	mu             sync.Mutex
	Servers        []*Server
	RequestsPerSec int
	SLAThreshold   time.Duration
	Violations     int
	TotalRequests  int
	History        []float32
	LastPrediction float32
	PendingLoad    []int
	RealRequests   int
}

func (s *Simulator) GetActiveServerCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	now := time.Now()
	for _, srv := range s.Servers {
		if srv.IsActive && now.After(srv.ActiveAt) {
			count++
		}
	}
	return count
}

func (s *Simulator) UpdateTargetServers(target int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	current := len(s.Servers)
	if target > current {
		// Scale up: Add servers with cold start (30s)
		for i := 0; i < target-current; i++ {
			s.Servers = append(s.Servers, &Server{
				ID:       current + i,
				IsActive: true,
				ActiveAt: time.Now().Add(30 * time.Second), // Cold start delay
			})
		}
		fmt.Printf("Scaling UP: %d -> %d (Cold start initiated)\n", current, target)
	} else if target < current {
		// Scale down: Remove immediately (simplified)
		s.Servers = s.Servers[:target]
		fmt.Printf("Scaling DOWN: %d -> %d\n", current, target)
	}
}

func (s *Simulator) ProcessRequest(req Request) {
	s.mu.Lock()
	s.TotalRequests++
	s.mu.Unlock()

	activeCount := s.GetActiveServerCount()
	if activeCount == 0 {
		activeCount = 1 // Safety to avoid division by zero
	}

	// Service time logic: Using 50 RPS per node as capacity
	capacityRPS := float64(activeCount) * 50.0 
	loadFactor := float64(s.RequestsPerSec) / capacityRPS
	
	processTime := time.Duration(rand.Intn(50)+50) * time.Millisecond
	if loadFactor > 0.9 {
		// Queueing delay increases exponentially as we approach capacity
		processTime += time.Duration(math.Pow(loadFactor, 4)*150) * time.Millisecond
	}

	time.Sleep(processTime)

	if processTime > s.SLAThreshold {
		s.mu.Lock()
		s.Violations++
		s.mu.Unlock()
	}
}

func main() {
	sim := &Simulator{
		Servers:        make([]*Server, 10),
		RequestsPerSec: 500,
		SLAThreshold:   200 * time.Millisecond,
		History:        []float32{}, 
	}
	// Pre-fill history with initial RPS (500) to avoid zero-bias in AI model
	for i := 0; i < 60; i++ {
		sim.History = append(sim.History, 500.0)
	}
	for i := 0; i < 10; i++ {
		sim.Servers[i] = &Server{ID: i, IsActive: true, ActiveAt: time.Now()}
	}

	// Ticker to periodically update scaling from Orchestrator
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		for range ticker.C {
			sim.mu.Lock()
			// Prepare history payload
			payload := struct {
				History []float32 `json:"history"`
			}{
				History: make([]float32, len(sim.History)),
			}
			copy(payload.History, sim.History)
			sim.mu.Unlock()

			body, _ := json.Marshal(payload)
			resp, err := http.Post("http://orchestrator:8082/scale", "application/json", bytes.NewBuffer(body))
			if err != nil {
				fmt.Printf("Orchestrator error: %v\n", err)
				continue
			}
			var result struct {
				Servers int     `json:"servers"`
				Upper   float32 `json:"predicted_upper_bound"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				fmt.Printf("Decode error: %v\n", err)
				resp.Body.Close()
				continue
			}
			resp.Body.Close()
			
			sim.mu.Lock()
			sim.LastPrediction = result.Upper
			sim.mu.Unlock()
			
			sim.UpdateTargetServers(result.Servers)
			
			fmt.Printf("Tick: Active=%d/Total=%d, Violations=%d, RPS=%d, Pred=%v\n", 
				sim.GetActiveServerCount(), len(sim.Servers), sim.Violations, sim.RequestsPerSec, result.Upper)
		}
	}()

	// Simulate traffic (Live Simulation)
	go func() {
		for {
			sim.mu.Lock()
			
			realLoad := sim.RealRequests
			sim.RealRequests = 0 // Reset for the next second

			if len(sim.PendingLoad) > 0 {
				sim.RequestsPerSec = sim.PendingLoad[0] + realLoad
				sim.PendingLoad = sim.PendingLoad[1:]
			} else if realLoad > 0 {
				// If there's actual traffic hitting the e-commerce endpoint, use that + a tiny baseline
				sim.RequestsPerSec = realLoad + rand.Intn(10)
			} else {
				// Idle / Baseline load when not simulating
				sim.RequestsPerSec = 400 + int(50*math.Sin(float64(time.Now().Unix())/60.0)) + rand.Intn(20)
			}
			
			rps := sim.RequestsPerSec
			
			// Update history here (once per second)
			sim.History = append(sim.History, float32(rps))
			if len(sim.History) > 60 {
				sim.History = sim.History[1:]
			}
			sim.mu.Unlock()

			for i := 0; i < rps/10; i++ { // Scaled down for local execution stability
				go sim.ProcessRequest(Request{ID: i, StartTime: time.Now()})
			}
			time.Sleep(1 * time.Second)
		}
	}()

	fmt.Println("Cloud Simulator (Go) running with Cold Start logic...")
	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")
		
		// DO NOT hold the lock while calling GetActiveServerCount(), it has its own lock!
		active := sim.GetActiveServerCount()
		
		sim.mu.Lock()
		defer sim.mu.Unlock()
		fmt.Fprintf(w, "{\"total_requests\": %d, \"violations\": %d, \"server_count\": %d, \"active_servers\": %d, \"predicted_load\": %f, \"current_rps\": %d}", 
			sim.TotalRequests, sim.Violations, len(sim.Servers), active, sim.LastPrediction, sim.RequestsPerSec)
	})

	http.HandleFunc("/start-simulation", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Data []int `json:"data"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		sim.mu.Lock()
		sim.PendingLoad = req.Data
		sim.Violations = 0 // Reset violations for new simulation run
		sim.TotalRequests = 0
		sim.RealRequests = 0
		sim.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, "{\"status\": \"started\", \"points\": %d}", len(req.Data))
	})

	// E-commerce Dummy Endpoint for External Load Testing (JMeter/Locust/Scripts)
	http.HandleFunc("/api/checkout", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		
		sim.mu.Lock()
		sim.TotalRequests++
		sim.RealRequests++ // Track actual live requests arriving at this endpoint
		sim.mu.Unlock()

		// Simulate slight network/processing delay for the actual request
		time.Sleep(time.Duration(rand.Intn(20)+10) * time.Millisecond)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"success","message":"Order processed successfully"}`))
	})

	log.Fatal(http.ListenAndServe(":8083", nil))
}
