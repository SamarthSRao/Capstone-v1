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
	ID       int
	IsActive bool
	ActiveAt time.Time
}

type PredictionState struct {
	Mean            []float64 `json:"predicted_mean"`
	Upper           []float64 `json:"predicted_upper"`
	Lower           []float64 `json:"predicted_lower"`
	RequiredServers int       `json:"required_servers"`
}

var latestPrediction PredictionState
var predMu sync.Mutex

type MetricsResponse struct {
	TotalRequests    int       `json:"total_requests"`
	Violations       int       `json:"violations"`
	ServerCount      int       `json:"server_count"`
	ActiveServers    int       `json:"active_servers"`
	PredictedLoad    float64   `json:"predicted_load"`
	CurrentRPS       int       `json:"current_rps"`
	SLAReliability   float64   `json:"sla_reliability"`
	Status           string    `json:"status"`
	PendingTicks     int       `json:"pending_ticks"`
	PredictedMean    []float64 `json:"predicted_mean"`
	PredictedUpper   []float64 `json:"predicted_upper"`
	PredictedLower   []float64 `json:"predicted_lower"`
	RequiredServers  int       `json:"required_servers"`
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
	SimStatus      string
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
		for i := 0; i < target-current; i++ {
			s.Servers = append(s.Servers, &Server{
				ID:       current + i,
				IsActive: true,
				ActiveAt: time.Now().Add(30 * time.Second),
			})
		}
		fmt.Printf("Scaling UP: %d -> %d (Cold start initiated)\n", current, target)
	} else if target < current {
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
		activeCount = 1
	}

	capacityRPS := float64(activeCount) * 50.0
	loadFactor := float64(s.RequestsPerSec) / capacityRPS

	processTime := time.Duration(rand.Intn(50)+50) * time.Millisecond
	if loadFactor > 0.9 {
		processTime += time.Duration(math.Pow(loadFactor, 4)*150) * time.Millisecond
	}

	time.Sleep(processTime)

	if processTime > s.SLAThreshold {
		s.mu.Lock()
		s.Violations++
		s.mu.Unlock()
	}
}

func UpdatePrediction(w http.ResponseWriter, r *http.Request) {
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

	var p PredictionState
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	predMu.Lock()
	latestPrediction = p
	predMu.Unlock()
	w.WriteHeader(http.StatusOK)
}

func main() {
	sim := &Simulator{
		Servers:        make([]*Server, 10),
		RequestsPerSec: 50,
		SLAThreshold:   200 * time.Millisecond,
		History:        []float32{},
		SimStatus:      "IDLE",
	}
	for i := 0; i < 60; i++ {
		sim.History = append(sim.History, 50.0)
	}
	for i := 0; i < 10; i++ {
		sim.Servers[i] = &Server{ID: i, IsActive: true, ActiveAt: time.Now()}
	}

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		for range ticker.C {
			sim.mu.Lock()
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

	go func() {
		for {
			sim.mu.Lock()

			realLoad := sim.RealRequests
			sim.RealRequests = 0

			wasSimulating := sim.SimStatus == "SIMULATING"

			if len(sim.PendingLoad) > 0 {
				sim.RequestsPerSec = sim.PendingLoad[0] + realLoad
				sim.PendingLoad = sim.PendingLoad[1:]
				sim.SimStatus = "SIMULATING"
			} else if realLoad > 0 {
				sim.RequestsPerSec = realLoad + rand.Intn(10)
				if sim.SimStatus != "SIMULATING" {
					sim.SimStatus = "IDLE"
				}
			} else {
				sim.RequestsPerSec = 50
				if wasSimulating {
					sim.SimStatus = "FINISHED"
				} else if sim.SimStatus == "FINISHED" {
					// keep FINISHED until next simulation starts
				} else {
					sim.SimStatus = "IDLE"
				}
			}

			rps := sim.RequestsPerSec

			sim.History = append(sim.History, float32(rps))
			if len(sim.History) > 60 {
				sim.History = sim.History[1:]
			}
			sim.mu.Unlock()

			for i := 0; i < rps/10; i++ {
				go sim.ProcessRequest(Request{ID: i, StartTime: time.Now()})
			}
			time.Sleep(1 * time.Second)
		}
	}()

	fmt.Println("Cloud Simulator (Go) running with Cold Start logic...")

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")

		active := sim.GetActiveServerCount()

		sim.mu.Lock()
		totalReq := sim.TotalRequests
		violations := sim.Violations
		serverCount := len(sim.Servers)
		lastPred := sim.LastPrediction
		currentRPS := sim.RequestsPerSec
		status := sim.SimStatus
		pendingTicks := len(sim.PendingLoad)
		sim.mu.Unlock()

		slaReliability := 100.0
		if totalReq > 0 {
			slaReliability = (1.0 - float64(violations)/float64(totalReq)) * 100.0
		}

		predMu.Lock()
		pred := latestPrediction
		predMu.Unlock()

		response := MetricsResponse{
			TotalRequests:   totalReq,
			Violations:      violations,
			ServerCount:     serverCount,
			ActiveServers:   active,
			PredictedLoad:   float64(lastPred),
			CurrentRPS:      currentRPS,
			SLAReliability:  slaReliability,
			Status:          status,
			PendingTicks:    pendingTicks,
			PredictedMean:   pred.Mean,
			PredictedUpper:  pred.Upper,
			PredictedLower:  pred.Lower,
			RequiredServers: pred.RequiredServers,
		}
		json.NewEncoder(w).Encode(response)
	})

	http.HandleFunc("/update-prediction", UpdatePrediction)

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
			Data     []int `json:"data"`
			Workload []int `json:"workload"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		workload := req.Data
		if len(workload) == 0 {
			workload = req.Workload
		}
		if len(workload) == 0 {
			http.Error(w, "workload required", http.StatusBadRequest)
			return
		}

		sim.mu.Lock()
		sim.PendingLoad = workload
		sim.SimStatus = "SIMULATING"
		sim.Violations = 0
		sim.TotalRequests = 0
		sim.RealRequests = 0
		sim.mu.Unlock()

		fmt.Printf("[Simulator] Dataset injected — %d ticks loaded\n", len(workload))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "started",
			"ticks":  len(workload),
			"points": len(workload),
		})
	})

	http.HandleFunc("/api/checkout", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")

		sim.mu.Lock()
		sim.TotalRequests++
		sim.RealRequests++
		sim.mu.Unlock()

		time.Sleep(time.Duration(rand.Intn(20)+10) * time.Millisecond)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"success","message":"Order processed successfully"}`))
	})

	log.Fatal(http.ListenAndServe(":8083", nil))
}
