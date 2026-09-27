package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
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
	Mean              []float64 `json:"predicted_mean"`
	Upper             []float64 `json:"predicted_upper"`
	Lower             []float64 `json:"predicted_lower"`
	RawMLMean         []float64 `json:"raw_ml_mean"`
	RequiredServers   int       `json:"required_servers"`
	ZScore            float64   `json:"z_score"`
	RLAction          int       `json:"rl_action"`
	RLActionLabel     string    `json:"rl_action_label"`
	ErrorRatio        float64   `json:"error_ratio"`
	StdDev            float64   `json:"std_dev"`
	StateVarianceNorm float64   `json:"state_variance_norm"`
	StateSLA          float64   `json:"state_sla"`
	StateWasteNorm    float64   `json:"state_waste_norm"`
	StateTrend        float64   `json:"state_trend"`
	StateHourSin      float64   `json:"state_hour_sin"`
}

var latestPrediction PredictionState
var predMu sync.Mutex

var (
	liveLoadMu   sync.Mutex
	liveLoadStop chan struct{}
)

type MetricsResponse struct {
	TotalRequests   int       `json:"total_requests"`
	Violations      int       `json:"violations"`
	ServerCount     int       `json:"server_count"`
	ActiveServers   int       `json:"active_servers"`
	PredictedLoad   float64   `json:"predicted_load"`
	CurrentRPS      int       `json:"current_rps"`
	SLAReliability  float64   `json:"sla_reliability"`
	Status          string    `json:"status"`
	PendingTicks    int       `json:"pending_ticks"`
	PredictedMean   []float64 `json:"predicted_mean"`
	PredictedUpper  []float64 `json:"predicted_upper"`
	PredictedLower  []float64 `json:"predicted_lower"`
	RawMLMean         []float64 `json:"raw_ml_mean"`
	RequiredServers   int       `json:"required_servers"`
	ZScore            float64   `json:"z_score"`
	RLAction          int       `json:"rl_action"`
	RLActionLabel     string    `json:"rl_action_label"`
	ErrorRatio        float64   `json:"error_ratio"`
	StdDev            float64   `json:"std_dev"`
	StateVarianceNorm float64   `json:"state_variance_norm"`
	StateSLA          float64   `json:"state_sla"`
	StateWasteNorm       float64   `json:"state_waste_norm"`
	StateTrend           float64   `json:"state_trend"`
	StateHourSin         float64   `json:"state_hour_sin"`
	OrganicCheckouts1s   int       `json:"organic_checkouts_1s"`
	SyntheticRPS         int       `json:"synthetic_rps"`
	HistoryLast          float64   `json:"history_last"`
}

type Simulator struct {
	mu              sync.Mutex
	Servers         []*Server
	RequestsPerSec  int
	SLAThreshold    time.Duration
	Violations      int
	TotalRequests   int
	History         []float32
	LastPrediction  float32
	PendingLoad     []int
	RealRequests         int
	OrganicCheckouts1s   int
	SyntheticRPS         int
	SimStatus            string
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
				ActiveAt: time.Now().Add(1 * time.Second),
			})
		}

		fmt.Printf(
			"Scaling UP: %d -> %d (Cold start initiated)\n",
			current,
			target,
		)

	} else if target < current {
		s.Servers = s.Servers[:target]

		fmt.Printf(
			"Scaling DOWN: %d -> %d\n",
			current,
			target,
		)
	}
}

func (s *Simulator) resetDemoState() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.RequestsPerSec = 0
	s.SimStatus = "IDLE"
	s.Violations = 0
	s.TotalRequests = 0
	s.RealRequests = 0
	s.OrganicCheckouts1s = 0
	s.SyntheticRPS = 0
	s.PendingLoad = nil
	s.LastPrediction = 0

	s.History = make([]float32, 60)
	for i := range s.History {
		s.History[i] = 0
	}

	now := time.Now()
	s.Servers = make([]*Server, 10)
	for i := 0; i < 10; i++ {
		s.Servers[i] = &Server{ID: i, IsActive: true, ActiveAt: now}
	}

	fmt.Println("[Simulator] Demo reset — 0 RPS, 10 servers, clean history")
}

func cancelLiveLoadLocked() {
	if liveLoadStop != nil {
		close(liveLoadStop)
		liveLoadStop = nil
	}
}

func cancelLiveLoad() {
	liveLoadMu.Lock()
	defer liveLoadMu.Unlock()
	cancelLiveLoadLocked()
}

func resetPredictorRL() {
	predictorURL := os.Getenv("PREDICTOR_HTTP_URL")
	if predictorURL == "" {
		predictorURL = "http://localhost:50052"
	}

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Post(predictorURL+"/reset", "application/json", bytes.NewBuffer([]byte("{}")))
	if err != nil {
		fmt.Printf("[Simulator] Predictor RL reset skipped: %v\n", err)
		return
	}
	resp.Body.Close()
	fmt.Println("[Simulator] Predictor RL z-score reset to baseline")
}

func (s *Simulator) fullDemoReset() {
	cancelLiveLoad()
	s.resetDemoState()
	resetPredictorRL()
	predMu.Lock()
	latestPrediction = PredictionState{}
	predMu.Unlock()
}

func (s *Simulator) resetBaselineFleet(size int) {
	if size < 1 {
		size = 10
	}

	s.Servers = make([]*Server, size)
	now := time.Now()

	for i := 0; i < size; i++ {
		s.Servers[i] = &Server{
			ID:       i,
			IsActive: true,
			ActiveAt: now,
		}
	}

	fmt.Printf(
		"[Simulator] Fleet reset to %d active baseline servers\n",
		size,
	)
}

func (s *Simulator) ProcessRequest(req Request) {
	s.mu.Lock()
	s.TotalRequests++
	currentRPS := s.RequestsPerSec
	s.mu.Unlock()

	activeCount := s.GetActiveServerCount()

	if activeCount == 0 {
		activeCount = 1
	}

	capacityRPS := float64(activeCount) * 50.0
	loadFactor := float64(currentRPS) / capacityRPS

	processTime := time.Duration(rand.Intn(50)+50) * time.Millisecond

	if loadFactor > 0.75 {
		processTime += time.Duration(
			math.Pow(loadFactor, 3)*120,
		) * time.Millisecond
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

func postCheckout(apiURL string, productID int, sessionID string) bool {
	payload := map[string]interface{}{
		"product_id": productID,
		"quantity":   1,
		"session_id": sessionID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return false
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(apiURL+"/api/checkout", "application/json", bytes.NewBuffer(body))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func runLiveLoad(workload []int, apiURL string, stop <-chan struct{}) {
	for tick, targetRps := range workload {
		select {
		case <-stop:
			fmt.Println("[Simulator] Live load stopped")
			return
		default:
		}

		checkouts := targetRps / 50
		if checkouts < 1 {
			checkouts = 1
		}

		ok := 0
		var wg sync.WaitGroup
		sem := make(chan struct{}, 20)

		for c := 0; c < checkouts; c++ {
			wg.Add(1)
			go func(idx int) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				productID := (idx % 12) + 1
				sessionID := fmt.Sprintf("sim-live-%d-%d", tick, idx)
				if postCheckout(apiURL, productID, sessionID) {
					ok++
				}
			}(c)
		}

		wg.Wait()

		if tick%5 == 0 {
			fmt.Printf(
				"[Simulator] Live tick %d: %d/%d checkouts OK (~%d RPS)\n",
				tick,
				ok,
				checkouts,
				ok*50,
			)
		}

		time.Sleep(1 * time.Second)

		select {
		case <-stop:
			fmt.Println("[Simulator] Live load stopped")
			return
		default:
		}
	}

	fmt.Println("[Simulator] Live load complete")
}

func main() {
	sim := &Simulator{
		Servers:        make([]*Server, 10),
		RequestsPerSec: 0,
		SLAThreshold:   200 * time.Millisecond,
		History:        []float32{},
		SimStatus:      "IDLE",
	}

	// Initialize 60 history points at zero (standby until simulation starts).
	for i := 0; i < 60; i++ {
		sim.History = append(sim.History, 0.0)
	}

	// Initialize 10 servers.
	for i := 0; i < 10; i++ {
		sim.Servers[i] = &Server{
			ID:       i,
			IsActive: true,
			ActiveAt: time.Now(),
		}
	}

	// ============================================================
	// ORCHESTRATOR CONNECTION
	// ============================================================
	//
	// Docker:
	//     ORCHESTRATOR_URL=http://orchestrator:8082
	//
	// Local Windows:
	//     defaults to http://localhost:8082
	//
	// ============================================================

	orchestratorURL := os.Getenv("ORCHESTRATOR_URL")

	if orchestratorURL == "" {
		orchestratorURL = "http://localhost:8082"
	}

	fmt.Printf(
		"[Simulator] Orchestrator URL: %s\n",
		orchestratorURL,
	)

	// ============================================================
	// ORCHESTRATOR / SCALING LOOP
	// ============================================================

	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for range ticker.C {
			sim.mu.Lock()

			active := 0
			now := time.Now()
			for _, srv := range sim.Servers {
				if srv.IsActive && now.After(srv.ActiveAt) {
					active++
				}
			}

			capacity := float32(active * 50)
			wasted := capacity - float32(sim.RequestsPerSec)
			if wasted < 0 {
				wasted = 0
			}

			slaRate := float32(0)
			if sim.TotalRequests > 0 {
				slaRate = float32(sim.Violations) / float32(sim.TotalRequests)
			}

			payload := struct {
				History       []float32 `json:"history"`
				CurrentSLA    float32   `json:"current_sla"`
				CurrentWasted float32   `json:"current_wasted"`
			}{
				History:       make([]float32, len(sim.History)),
				CurrentSLA:    slaRate,
				CurrentWasted: wasted,
			}

			copy(payload.History, sim.History)

			sim.mu.Unlock()

			body, err := json.Marshal(payload)

			if err != nil {
				fmt.Printf(
					"Failed to encode orchestrator request: %v\n",
					err,
				)
				continue
			}

			resp, err := http.Post(
				orchestratorURL+"/scale",
				"application/json",
				bytes.NewBuffer(body),
			)

			if err != nil {
				fmt.Printf(
					"Orchestrator error: %v\n",
					err,
				)
				continue
			}

			// ====================================================
			// NEW DEBUGGING LOGIC
			// ====================================================

			// Check HTTP status BEFORE attempting JSON decoding.
			if resp.StatusCode != http.StatusOK {
				responseBody, readErr := io.ReadAll(resp.Body)
				resp.Body.Close()

				if readErr != nil {
					fmt.Printf(
						"Orchestrator returned HTTP %d, but response body could not be read: %v\n",
						resp.StatusCode,
						readErr,
					)
				} else {
					fmt.Printf(
						"Orchestrator returned HTTP %d: %s\n",
						resp.StatusCode,
						string(responseBody),
					)
				}

				continue
			}

			var result struct {
				Servers int     `json:"servers"`
				Upper   float32 `json:"predicted_upper_bound"`
			}

			if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
				fmt.Printf(
					"Decode error: %v\n",
					err,
				)

				resp.Body.Close()
				continue
			}

			resp.Body.Close()

			// ====================================================
			// UPDATE PREDICTION
			// ====================================================

			sim.mu.Lock()

			sim.LastPrediction = result.Upper

			sim.mu.Unlock()

			// ====================================================
			// UPDATE SERVER COUNT
			// ====================================================

			if result.Servers > 0 {
				sim.UpdateTargetServers(result.Servers)
			}

			fmt.Printf(
				"Tick: Active=%d/Total=%d, Violations=%d, RPS=%d, Pred=%v\n",
				sim.GetActiveServerCount(),
				len(sim.Servers),
				sim.Violations,
				sim.RequestsPerSec,
				result.Upper,
			)
		}
	}()

	// ============================================================
	// SIMULATION LOOP
	// ============================================================

	go func() {
		for {
			sim.mu.Lock()

			realLoad := sim.RealRequests
			sim.RealRequests = 0
			sim.OrganicCheckouts1s = realLoad

			wasSimulating := sim.SimStatus == "SIMULATING"
			syntheticRPS := 0

			if len(sim.PendingLoad) > 0 {
				syntheticRPS = sim.PendingLoad[0]
				sim.RequestsPerSec =
					syntheticRPS + realLoad*50

				sim.PendingLoad =
					sim.PendingLoad[1:]

				if realLoad > 0 {
					sim.SimStatus = "ORGANIC"
				} else {
					sim.SimStatus = "SIMULATING"
				}

			} else if realLoad > 0 {
				// Each real checkout (Locust, storefront, or dashboard) ≈ 50 RPS
				// so organic traffic is visible on the dashboard chart.
				sim.RequestsPerSec =
					realLoad*50 + rand.Intn(10)

				sim.SimStatus = "ORGANIC"

			} else {
				sim.RequestsPerSec = 0

				if wasSimulating {
					sim.SimStatus = "FINISHED"
				} else if sim.SimStatus == "FINISHED" {
					// Keep FINISHED until another simulation starts.
				} else {
					sim.SimStatus = "IDLE"
				}
			}

			rps := sim.RequestsPerSec
			sim.SyntheticRPS = syntheticRPS

			sim.History = append(
				sim.History,
				float32(rps),
			)

			if len(sim.History) > 60 {
				sim.History = sim.History[1:]
			}

			sim.mu.Unlock()

			for i := 0; i < rps/10; i++ {
				go sim.ProcessRequest(
					Request{
						ID:        i,
						StartTime: time.Now(),
					},
				)
			}

			time.Sleep(1 * time.Second)
		}
	}()

	fmt.Println(
		"Cloud Simulator (Go) running with Cold Start logic...",
	)

	// ============================================================
	// GET /metrics
	// ============================================================

	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(
			"Access-Control-Allow-Origin",
			"*",
		)

		w.Header().Set(
			"Content-Type",
			"application/json",
		)

		active := sim.GetActiveServerCount()

		sim.mu.Lock()

		totalReq := sim.TotalRequests
		violations := sim.Violations
		serverCount := len(sim.Servers)
		lastPred := sim.LastPrediction
		currentRPS := sim.RequestsPerSec
		status := sim.SimStatus
		pendingTicks := len(sim.PendingLoad)
		organic1s := sim.OrganicCheckouts1s
		syntheticRPS := sim.SyntheticRPS
		historyLast := 50.0
		if len(sim.History) > 0 {
			historyLast = float64(sim.History[len(sim.History)-1])
		}

		sim.mu.Unlock()

		slaReliability := 100.0

		if totalReq > 0 {
			slaReliability =
				(1.0 -
					float64(violations)/float64(totalReq)) *
					100.0
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
			RawMLMean:         pred.RawMLMean,
			RequiredServers:   pred.RequiredServers,
			ZScore:            pred.ZScore,
			RLAction:          pred.RLAction,
			RLActionLabel:     pred.RLActionLabel,
			ErrorRatio:        pred.ErrorRatio,
			StdDev:            pred.StdDev,
			StateVarianceNorm: pred.StateVarianceNorm,
			StateSLA:          pred.StateSLA,
			StateWasteNorm:    pred.StateWasteNorm,
			StateTrend:         pred.StateTrend,
			StateHourSin:       pred.StateHourSin,
			OrganicCheckouts1s: organic1s,
			SyntheticRPS:       syntheticRPS,
			HistoryLast:        historyLast,
		}

		json.NewEncoder(w).Encode(response)
	})

	// ============================================================
	// POST /update-prediction
	// ============================================================

	http.HandleFunc(
		"/update-prediction",
		UpdatePrediction,
	)

	// POST /reset — zero RPS standby for demo (chart starts flat until simulation)
	http.HandleFunc("/reset", func(w http.ResponseWriter, r *http.Request) {
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
		cancelLiveLoad()
		sim.resetDemoState()
		predMu.Lock()
		latestPrediction = PredictionState{}
		predMu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
	})

	// POST /stop — cancel load + full demo reset (0 RPS, 10 servers, RL z baseline)
	http.HandleFunc("/stop", func(w http.ResponseWriter, r *http.Request) {
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
		sim.fullDemoReset()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
	})

	// ============================================================
	// POST /start-simulation
	// ============================================================

	http.HandleFunc(
		"/start-simulation",
		func(w http.ResponseWriter, r *http.Request) {

			w.Header().Set(
				"Access-Control-Allow-Origin",
				"*",
			)

			if r.Method == http.MethodOptions {
				w.Header().Set(
					"Access-Control-Allow-Methods",
					"POST, OPTIONS",
				)

				w.Header().Set(
					"Access-Control-Allow-Headers",
					"Content-Type",
				)

				w.WriteHeader(http.StatusOK)
				return
			}

			if r.Method != http.MethodPost {
				http.Error(
					w,
					"Only POST allowed",
					http.StatusMethodNotAllowed,
				)

				return
			}

			var req struct {
				Data     []int `json:"data"`
				Workload []int `json:"workload"`
			}

			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(
					w,
					"Invalid request body",
					http.StatusBadRequest,
				)

				return
			}

			workload := req.Data

			if len(workload) == 0 {
				workload = req.Workload
			}

			if len(workload) == 0 {
				http.Error(
					w,
					"workload required",
					http.StatusBadRequest,
				)

				return
			}

			sim.resetDemoState()
			sim.mu.Lock()
			sim.PendingLoad = workload
			sim.SimStatus = "SIMULATING"
			sim.mu.Unlock()

			fmt.Printf(
				"[Simulator] Dataset injected — %d ticks loaded\n",
				len(workload),
			)

			w.Header().Set(
				"Content-Type",
				"application/json",
			)

			json.NewEncoder(w).Encode(
				map[string]interface{}{
					"status": "started",
					"ticks":  len(workload),
					"points": len(workload),
				},
			)
		},
	)

	// ============================================================
	// POST /run-live-load — server-side checkouts via NexusGear API
	// (avoids browser CORS/preflight storms from the dashboard)
	// ============================================================

	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8080"
	}

	http.HandleFunc(
		"/run-live-load",
		func(w http.ResponseWriter, r *http.Request) {
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
				Workload []int  `json:"workload"`
				ApiURL   string `json:"api_url"`
			}

			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid request body", http.StatusBadRequest)
				return
			}

			if len(req.Workload) == 0 {
				http.Error(w, "workload required", http.StatusBadRequest)
				return
			}

			targetAPI := apiURL
			if req.ApiURL != "" {
				targetAPI = req.ApiURL
			}

			workload := req.Workload

			liveLoadMu.Lock()
			cancelLiveLoadLocked()
			stop := make(chan struct{})
			liveLoadStop = stop
			liveLoadMu.Unlock()

			sim.resetDemoState()
			sim.mu.Lock()
			sim.SimStatus = "ORGANIC"
			sim.mu.Unlock()

			fmt.Printf(
				"[Simulator] Live load started — %d ticks via %s\n",
				len(workload),
				targetAPI,
			)

			go runLiveLoad(workload, targetAPI, stop)

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status":  "started",
				"ticks":   len(workload),
				"api_url": targetAPI,
			})
		},
	)

	// ============================================================
	// POST /api/checkout
	// ============================================================

	http.HandleFunc(
		"/api/checkout",
		func(w http.ResponseWriter, r *http.Request) {

			w.Header().Set(
				"Access-Control-Allow-Origin",
				"*",
			)

			sim.mu.Lock()

			sim.TotalRequests++
			sim.RealRequests++

			sim.mu.Unlock()

			time.Sleep(
				time.Duration(
					rand.Intn(20)+10,
				) * time.Millisecond,
			)

			w.Header().Set(
				"Content-Type",
				"application/json",
			)

			w.WriteHeader(http.StatusOK)

			w.Write(
				[]byte(
					`{"status":"success","message":"Order processed successfully"}`,
				),
			)
		},
	)

	// ============================================================
	// START SERVER
	// ============================================================

	fmt.Println("[Simulator] Listening on http://localhost:8083")

	log.Fatal(
		http.ListenAndServe(
			":8083",
			nil,
		),
	)
}