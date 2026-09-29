package main

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"time"
)

// parseStubStatusRequests returns the cumulative request counter from an
// nginx stub_status body.
//
// The page looks like this:
//
//	Active connections: 1
//	server accepts handled requests
//	 10 10 250
//	Reading: 0 Writing: 1 Waiting: 0
//
// "Active connections: 1" also tokenizes to three fields. A parser that
// accepts any 3-field line and reads the last token therefore records the
// active-connection gauge (often 0 or 1) instead of the requests counter,
// so the derived RPS stays near zero and the predictor never sees load.
// The counter line is the only one whose three fields are all integers
// (accepts, handled, requests). The third field is the request counter.
func parseStubStatusRequests(body string) (int64, bool) {
	body = strings.ReplaceAll(body, "\r\n", "\n")
	for _, line := range strings.Split(body, "\n") {
		fields := strings.Fields(line)
		if len(fields) != 3 {
			continue
		}
		if _, err := strconv.ParseInt(fields[0], 10, 64); err != nil {
			continue
		}
		if _, err := strconv.ParseInt(fields[1], 10, 64); err != nil {
			continue
		}
		requests, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil {
			continue
		}
		return requests, true
	}
	return 0, false
}

// requestsPerSecond converts a stub_status counter delta into a rate.
// A backwards jump (nginx restart) is reported as zero rather than a
// negative rate. elapsed is the time since the previous sample.
func requestsPerSecond(prev, curr int64, elapsed time.Duration) float64 {
	if prev < 0 || curr < prev || elapsed <= 0 {
		return 0
	}
	return float64(curr-prev) / elapsed.Seconds()
}

// ReplicasForLoad maps a forecasted arrival rate (requests per second) to a
// replica count that fits a small AKS node pool.
//
// mu is the service rate of ONE replica in requests per second, not per
// minute. A target-app pod serves about 200 RPS, so a 200 RPS forecast maps
// to one or two pods and a ~300 RPS upper bound (low load plus the model's
// ~132 RPS uncertainty) stays at two pods instead of walking up to the clamp.
//
// The base count is ceil(lambda / mu). If that count is saturated
// (arrival rate >= capacity) Erlang-C's wait probability is 1, so one extra
// replica is added as queueing headroom. Erlang-C is not searched upward
// beyond that single extra pod: a strict 1% wait target on top of model
// uncertainty previously pinned the fleet at MaxReplicas.
func ReplicasForLoad(lambda, mu float64, minR, maxR int) int {
	if minR < 1 {
		minR = 1
	}
	if maxR < minR {
		maxR = minR
	}
	if lambda <= 0 || mu <= 0 || math.IsNaN(lambda) || math.IsInf(lambda, 0) || math.IsNaN(mu) {
		return minR
	}
	n := int(math.Ceil(lambda / mu))
	if n < 1 {
		n = 1
	}
	intensity := lambda / mu
	if float64(n) <= intensity {
		// rho >= 1. One spare replica; do not iterate Erlang-C to the cap.
		n++
	}
	if n < minR {
		n = minR
	}
	if n > maxR {
		n = maxR
	}
	return n
}

// recentSlope is the per-sample rise in RPS over the trailing window.
// Samples are one second apart in the autonomous loop. A falling window
// returns 0 so a quiet period does not pull the forecast down; scale-down
// is handled separately by the stabilization policy.
func recentSlope(history []float32, window int) float64 {
	if len(history) < 2 {
		return 0
	}
	if window < 2 || window > len(history) {
		window = len(history)
	}
	start := len(history) - window
	delta := float64(history[len(history)-1] - history[start])
	steps := float64(len(history) - 1 - start)
	if steps <= 0 || delta <= 0 {
		return 0
	}
	return delta / steps
}

// leadAdjustedLambda looks ahead across pod startup. The model returns one
// upper bound; image pull and readiness take longer than that single step.
// During a ramp we project the recent slope forward by lead and take the
// max of that projection and the model's upper bound, so replicas are
// requested before the higher load is being served.
func leadAdjustedLambda(upperBound, currentRPS, slopePerSec float64, lead time.Duration) float64 {
	if lead < 0 {
		lead = 0
	}
	projected := currentRPS + slopePerSec*lead.Seconds()
	if projected < 0 || math.IsNaN(projected) {
		projected = 0
	}
	if math.IsNaN(upperBound) || upperBound < 0 {
		upperBound = 0
	}
	if projected > upperBound {
		return projected
	}
	return upperBound
}

// ScalePolicy controls how fast the actuator may change replica count.
// Scale-up is immediate (no cooldown) so pods start before the load arrives.
// Scale-down waits ScaleDownStabilization after the last change, then sheds
// at most ScaleDownStep replicas. That stops a 10 -> 1 collapse in one tick.
type ScalePolicy struct {
	MinReplicas            int
	MaxReplicas            int
	ScaleDownStabilization time.Duration
	ScaleDownStep          int
}

// ScaleDecision is the replica count to apply on this tick.
// Direction is "up", "down", or "hold".
type ScaleDecision struct {
	Next      int
	Direction string
}

func normalizeScalePolicy(p ScalePolicy) ScalePolicy {
	if p.MinReplicas < 1 {
		p.MinReplicas = 1
	}
	if p.MaxReplicas < p.MinReplicas {
		p.MaxReplicas = p.MinReplicas
	}
	if p.ScaleDownStep < 1 {
		p.ScaleDownStep = 1
	}
	if p.ScaleDownStabilization < 0 {
		p.ScaleDownStabilization = 0
	}
	return p
}

func clampReplicas(n, minR, maxR int) int {
	if n < minR {
		return minR
	}
	if n > maxR {
		return maxR
	}
	return n
}

// applyScalePolicy chooses the next replica count.
// sinceLastChange is the time since the last successful scale-up or scale-down.
// It gates scale-down only; scale-up is never delayed.
func applyScalePolicy(current, desired int, sinceLastChange time.Duration, p ScalePolicy) ScaleDecision {
	p = normalizeScalePolicy(p)
	desired = clampReplicas(desired, p.MinReplicas, p.MaxReplicas)
	current = clampReplicas(current, p.MinReplicas, p.MaxReplicas)

	if desired > current {
		return ScaleDecision{Next: desired, Direction: "up"}
	}
	if desired < current {
		if sinceLastChange < p.ScaleDownStabilization {
			return ScaleDecision{Next: current, Direction: "hold"}
		}
		next := current - p.ScaleDownStep
		if next < desired {
			next = desired
		}
		return ScaleDecision{Next: clampReplicas(next, p.MinReplicas, p.MaxReplicas), Direction: "down"}
	}
	return ScaleDecision{Next: current, Direction: "hold"}
}

// replicaCountAfterScale keeps the previous count when the actuator returns
// an error. A failed PATCH must not be recorded as the live replica count,
// or the next tick will think the fleet already moved.
func replicaCountAfterScale(current, requested int, scaleErr error) (int, bool) {
	if scaleErr != nil {
		return current, false
	}
	return requested, true
}

// capacityFeedback builds the two DQN inputs the predictor was trained with.
// sla is 1 when demand exceeds capacity and 0 otherwise (the monitor averages
// this over a short window, matching the training violation rate).
// wastedRPS is unused capacity in requests per second. The predictor divides
// that value by 1000 before placing it in the RL state, which is how waste
// was scaled during training.
func capacityFeedback(currentRPS float64, replicas int, serviceRate float64) (sla float32, wastedRPS float32) {
	if replicas < 1 {
		replicas = 1
	}
	if serviceRate < 0 || math.IsNaN(serviceRate) {
		serviceRate = 0
	}
	if currentRPS < 0 || math.IsNaN(currentRPS) {
		currentRPS = 0
	}
	capacity := float64(replicas) * serviceRate
	if currentRPS > capacity {
		return 1, 0
	}
	return 0, float32(capacity - currentRPS)
}

// feedbackWindow is a fixed-length average of instantaneous SLA and waste
// samples. Training fed the DQN a running violation rate and mean wasted
// capacity, not a constant zero.
type feedbackWindow struct {
	sla   []float64
	waste []float64
	size  int
}

func (f *feedbackWindow) push(sla, waste float64) (avgSLA, avgWaste float32) {
	size := f.size
	if size < 1 {
		size = 30
	}
	f.sla = append(f.sla, sla)
	f.waste = append(f.waste, waste)
	if len(f.sla) > size {
		f.sla = f.sla[len(f.sla)-size:]
		f.waste = f.waste[len(f.waste)-size:]
	}
	var s, w float64
	for i := range f.sla {
		s += f.sla[i]
		w += f.waste[i]
	}
	n := float64(len(f.sla))
	return float32(s / n), float32(w / n)
}

// parseDeploymentScale reads spec.replicas from a Deployment scale subresource
// (or a Deployment JSON document, which has the same spec.replicas field).
func parseDeploymentScale(body []byte) (int, error) {
	var doc struct {
		Spec struct {
			Replicas int `json:"replicas"`
		} `json:"spec"`
	}
	if err := json.Unmarshal(body, &doc); err != nil {
		return 0, err
	}
	return doc.Spec.Replicas, nil
}

// normalizePredictorTarget turns PREDICTOR_URL into a gRPC dial target.
// Empty means the in-cluster Service. An http scheme is stripped because
// grpc.Dial does not accept one.
func normalizePredictorTarget(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimRight(raw, "/")
	if raw == "" {
		return "predictor:50051"
	}
	return raw
}
