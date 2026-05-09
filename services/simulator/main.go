package main

import (
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

type Simulator struct {
	mu             sync.Mutex
	ActiveServers  int
	RequestsPerSec int
	SLAThreshold   time.Duration // e.g., 200ms
	Violations     int
	TotalRequests  int
}

func (s *Simulator) ProcessRequest(req Request) {
	s.mu.Lock()
	s.TotalRequests++
	s.mu.Unlock()

	// Simulate processing time
	// In M/M/c, service time is exponential. We'll simplify with a random delay.
	// If servers are overwhelmed, delay increases.
	loadFactor := float64(s.RequestsPerSec) / (float64(s.ActiveServers) * 50.0 / 60.0) // 50 requests per min
	
	processTime := time.Duration(rand.Intn(50)+50) * time.Millisecond
	if loadFactor > 1.0 {
		// Queueing delay increases exponentially when overloaded
		processTime += time.Duration(math.Pow(loadFactor, 3)*100) * time.Millisecond
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
		ActiveServers:  10,
		RequestsPerSec: 100,
		SLAThreshold:   200 * time.Millisecond,
	}

	// Ticker to periodically update scaling from Orchestrator
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		for range ticker.C {
			// Call Orchestrator/scale
			// resp, err := http.Get("http://orchestrator:8082/scale")
			// ... parse resp and update sim.ActiveServers ...
			fmt.Printf("Tick: ActiveServers=%d, TotalRequests=%d, Violations=%d\n", sim.ActiveServers, sim.TotalRequests, sim.Violations)
		}
	}()

	// Simulate high-concurrency traffic using Goroutines
	go func() {
		for {
			rps := sim.RequestsPerSec
			for i := 0; i < rps; i++ {
				go sim.ProcessRequest(Request{ID: i, StartTime: time.Now()})
			}
			time.Sleep(1 * time.Second)
		}
	}()

	fmt.Println("Cloud Simulator (Go) running...")
	// API to update simulator params or get metrics
	http.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		sim.mu.Lock()
		defer sim.mu.Unlock()
		fmt.Fprintf(w, "{\"total_requests\": %d, \"violations\": %d, \"server_count\": %d}", sim.TotalRequests, sim.Violations, sim.ActiveServers)
	})

	log.Fatal(http.ListenAndServe(":8083", nil))
}
