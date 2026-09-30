package main

import (
	"errors"
	"math"
	"strings"
	"testing"
	"time"
)

const stubStatusSample = "Active connections: 291 \n" +
	"server accepts handled requests\n" +
	" 16630948 16630948 31070465 \n" +
	"Reading: 6 Writing: 179 Waiting: 106 \n"

func TestParseStubStatusUsesRequestCounter(t *testing.T) {
	got, ok := parseStubStatusRequests(stubStatusSample)
	if !ok {
		t.Fatal("expected the accepts/handled/requests line to parse")
	}
	if got != 31070465 {
		t.Fatalf("requests = %d, want 31070465 (not the Active connections gauge 291)", got)
	}
}

func TestParseStubStatusIgnoresActiveConnectionsLine(t *testing.T) {
	// This is the line the old parser treated as the request counter.
	body := "Active connections: 291\nserver accepts handled requests\n"
	_, ok := parseStubStatusRequests(body)
	if ok {
		t.Fatal("a page with no integer counter line must not parse")
	}
}

func TestParseStubStatusCRLFAndSmallCounters(t *testing.T) {
	body := "Active connections: 1\r\nserver accepts handled requests\r\n 10 10 250\r\nReading: 0 Writing: 1 Waiting: 0\r\n"
	got, ok := parseStubStatusRequests(body)
	if !ok || got != 250 {
		t.Fatalf("got (%d, %v), want (250, true)", got, ok)
	}
}

func TestRequestsPerSecond(t *testing.T) {
	if got := requestsPerSecond(100, 150, time.Second); got != 50 {
		t.Fatalf("1s delta: got %v want 50", got)
	}
	if got := requestsPerSecond(100, 200, 2*time.Second); got != 50 {
		t.Fatalf("2s delta: got %v want 50", got)
	}
	if got := requestsPerSecond(100, 100, time.Second); got != 0 {
		t.Fatalf("flat counter: got %v want 0", got)
	}
	if got := requestsPerSecond(100, 40, time.Second); got != 0 {
		t.Fatalf("counter reset: got %v want 0", got)
	}
	if got := requestsPerSecond(-1, 10, time.Second); got != 0 {
		t.Fatalf("unset previous sample: got %v want 0", got)
	}
}

func TestReplicasForLoadCalibration(t *testing.T) {
	const mu = 200.0 // RPS per pod

	if got := ReplicasForLoad(0, mu, 1, 10); got != 1 {
		t.Fatalf("idle: got %d want 1", got)
	}
	if got := ReplicasForLoad(50, mu, 1, 10); got != 1 {
		t.Fatalf("50 RPS: got %d want 1", got)
	}
	got200 := ReplicasForLoad(200, mu, 1, 10)
	if got200 < 1 || got200 > 2 {
		t.Fatalf("200 RPS: got %d, want 1 or 2 pods", got200)
	}
	// ~300 RPS is a low-load forecast inflated by ~132 RPS of model uncertainty.
	// It must not pin the fleet at the clamp.
	if got := ReplicasForLoad(300, mu, 1, 10); got > 2 {
		t.Fatalf("300 RPS upper bound: got %d, want <= 2 (not the clamp of 10)", got)
	}
	if got := ReplicasForLoad(1000, mu, 1, 10); got < 5 || got > 6 {
		t.Fatalf("1000 RPS: got %d, want 5 or 6", got)
	}
	if got := ReplicasForLoad(5000, mu, 1, 10); got != 10 {
		t.Fatalf("overload clamp: got %d want 10", got)
	}
	if got := ReplicasForLoad(10, mu, 2, 10); got != 2 {
		t.Fatalf("warm floor: got %d want min 2", got)
	}
}

func TestReplicasForLoadIsMonotonic(t *testing.T) {
	prev := 1
	for _, lambda := range []float64{1, 50, 100, 200, 300, 400, 800, 1200, 2000, 5000} {
		got := ReplicasForLoad(lambda, 200, 1, 10)
		if got < prev {
			t.Fatalf("lambda %v -> %d decreased from %d", lambda, got, prev)
		}
		if got < 1 || got > 10 {
			t.Fatalf("lambda %v -> %d outside [1,10]", lambda, got)
		}
		prev = got
	}
}

func TestServiceRateIsPerSecondNotPerMinute(t *testing.T) {
	// 50 requests/minute interpreted as a per-second rate would be ~0.83 RPS
	// and would demand a huge fleet. The calibrated per-second rate (200 RPS
	// per pod) keeps a 200 RPS forecast inside two pods.
	perMinuteMistake := ReplicasForLoad(200, 50.0/60.0, 1, 10)
	if perMinuteMistake != 10 {
		t.Fatalf("sanity: treating 50/min as mu should hit the clamp, got %d", perMinuteMistake)
	}
	if got := ReplicasForLoad(200, 200, 1, 10); got > 2 {
		t.Fatalf("per-second mu=200 at 200 RPS got %d", got)
	}
}

func TestIdleUpperBoundSpikeDoesNotAddPods(t *testing.T) {
	// Kind observation: live RPS ~1, forecast mean ~72, std ~105, and the
	// upper bound occasionally reading 178, 283, 285, or 438. Those are
	// mean + z*std with the error term at zero (RPS is below the mean).
	// 178 stays on 1 pod; 285 crosses into 2; 438 crosses into 3.
	guard := ForecastGuard{FlatHeadroomRPS: 50, RisingSlope: 2}
	const mu = 200.0
	for _, upper := range []float64{178, 283, 285, 438} {
		raw := ReplicasForLoad(upper, mu, 1, 10)
		lambda := actionableForecast(upper, 1, 0, 30*time.Second, guard)
		got := ReplicasForLoad(lambda, mu, 1, 10)
		if got != 1 {
			t.Fatalf("idle upper %.0f (raw replicas %d) -> actionable %.1f -> %d pods, want 1", upper, raw, lambda, got)
		}
	}
	// A flat series whose raw bound would be a steady 2 pods still stays at 1.
	lambda := actionableForecast(300, 1, 0.2, 30*time.Second, guard)
	if got := ReplicasForLoad(lambda, mu, 1, 10); got != 1 {
		t.Fatalf("sub-threshold slope still scaled to %d (lambda %.1f)", got, lambda)
	}
}

func TestRampTrustsUpperBoundImmediately(t *testing.T) {
	guard := ForecastGuard{FlatHeadroomRPS: 50, RisingSlope: 2}
	const mu = 200.0
	// Live rate has started climbing; the model upper bound is already ahead.
	lambda := actionableForecast(1200, 40, 20, 30*time.Second, guard)
	if lambda < 1200 {
		t.Fatalf("rising traffic must keep the upper bound, got %.1f", lambda)
	}
	got := ReplicasForLoad(lambda, mu, 1, 10)
	if got < 6 {
		t.Fatalf("ramp replicas %d, want an immediate multi-pod scale-up", got)
	}
	decision := applyScalePolicy(1, got, 0, ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 45 * time.Second,
		ScaleDownStep:          1,
	})
	if decision.Direction != "up" || decision.Next != got {
		t.Fatalf("scale-up delayed: %+v", decision)
	}
	// Slope at the threshold is enough. Just under it is still idle noise.
	if at := actionableForecast(900, 30, 2, 30*time.Second, guard); at < 900 {
		t.Fatalf("slope at threshold should trust the bound, got %.1f", at)
	}
	if under := actionableForecast(900, 5, 1.9, 30*time.Second, guard); under > 5+50 {
		t.Fatalf("slope under threshold should be capped, got %.1f", under)
	}
}

func prescaleFixture() (ForecastGuard, PrescaleConfig) {
	return ForecastGuard{FlatHeadroomRPS: 50, RisingSlope: 2}, PrescaleConfig{PersistTicks: 3, MarginCapRPS: 40, SmoothAlpha: 0.2}
}

func TestIdleUpperBoundSpikesNeverScale(t *testing.T) {
	// 10 minutes at ~1 RPS. The upper bound cycles through the kind readings
	// (178, 285, 438) while the forecast mean stays near 72, under the
	// 200 RPS capacity of one pod. Desired replicas must stay at 1.
	guard, cfg := prescaleFixture()
	const mu = 200.0
	state := &PrescaleState{}
	uppers := []float64{178, 285, 283, 438}
	for tick := 0; tick < 600; tick++ {
		upper := uppers[tick%len(uppers)]
		signal := decideScaleRate(upper, 72, 1, 0, mu, 30*time.Second, guard, cfg, state)
		got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if got != 1 {
			t.Fatalf("tick %d upper %.0f rule %s lambda %.1f -> %d pods", tick, upper, signal.Rule, signal.Lambda, got)
		}
		if signal.Rule != ruleIdleGuard {
			t.Fatalf("tick %d rule %s, want idle-guard", tick, signal.Rule)
		}
	}
	// One mean sample as wild as the upper bound is still not a forecast.
	signal := decideScaleRate(438, 438, 1, 0, mu, 30*time.Second, guard, cfg, state)
	if got := ReplicasForLoad(signal.Lambda, mu, 1, 10); got != 1 {
		t.Fatalf("single mean spike scaled to %d (rule %s lambda %.1f)", got, signal.Rule, signal.Lambda)
	}
}

func TestPersistentMeanScalesBeforeLiveCrossesCapacity(t *testing.T) {
	guard, cfg := prescaleFixture()
	const mu = 200.0
	state := &PrescaleState{}
	// Live RPS is 80 and flat. One pod can still serve it (capacity 200).
	// The forecast mean is already 250, which is the horizon value.
	var signal ScaleSignal
	for tick := 0; tick < 3; tick++ {
		signal = decideScaleRate(438, 250, 80, 0, mu, 30*time.Second, guard, cfg, state)
		got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if tick < 2 {
			if got != 1 {
				t.Fatalf("tick %d scaled early to %d (rule %s)", tick, got, signal.Rule)
			}
			continue
		}
		if signal.Rule != rulePersistence {
			t.Fatalf("tick %d rule %s, want forecast-persistence", tick, signal.Rule)
		}
		if got < 2 {
			t.Fatalf("persistent mean did not add a pod: %+v -> %d", signal, got)
		}
		if 80 >= mu {
			t.Fatal("test setup: live RPS must still be under one pod")
		}
	}
	// The idle cap on the upper bound would have held this at 1 RPS + 50.
	// Persistence must not inherit that cap.
	if signal.Lambda < 250 {
		t.Fatalf("persistence lambda %.1f was capped like the upper bound", signal.Lambda)
	}
}

func TestSmoothedMarginPrescalesWhenMeanIsNearCapacity(t *testing.T) {
	// Mean stays just under capacity, so the persistence counter never trips.
	// The smoothed lead margin is what crosses the line, after more than one tick.
	guard, cfg := prescaleFixture()
	const mu = 200.0
	state := &PrescaleState{}
	fired := -1
	for tick := 0; tick < 12; tick++ {
		signal := decideScaleRate(50, 190, 100, 0, mu, 30*time.Second, guard, cfg, state)
		got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if tick == 0 && got != 1 {
			t.Fatalf("margin rule fired on the first tick: %+v", signal)
		}
		if got >= 2 && fired < 0 {
			fired = tick
			if signal.Rule != ruleMargin {
				t.Fatalf("tick %d rule %s, want forecast-margin", tick, signal.Rule)
			}
		}
	}
	if fired < 2 {
		t.Fatalf("margin rule fired at tick %d, want it to wait for the smooth", fired)
	}
}

func TestRampStillScalesImmediatelyWithPrescale(t *testing.T) {
	guard, cfg := prescaleFixture()
	const mu = 200.0
	state := &PrescaleState{}
	// First tick of a real ramp. Persistence has not had time to count.
	signal := decideScaleRate(1200, 50, 40, 20, mu, 30*time.Second, guard, cfg, state)
	if signal.Rule != ruleSlope {
		t.Fatalf("rule %s, want slope", signal.Rule)
	}
	if signal.Lambda < 1200 {
		t.Fatalf("ramp lambda %.1f, want the upper bound", signal.Lambda)
	}
	got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
	if got < 6 {
		t.Fatalf("ramp replicas %d", got)
	}
	decision := applyScalePolicy(1, got, 0, ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 45 * time.Second,
		ScaleDownStep:          1,
	})
	if decision.Direction != "up" || decision.Next != got {
		t.Fatalf("scale-up delayed: %+v", decision)
	}
}

func TestLeadTimeProjection(t *testing.T) {
	// Upper bound has not caught up, but RPS is rising 10/s. Over a 30s
	// pod start we should provision for 50+300=350, not the stale upper bound.
	got := leadAdjustedLambda(100, 50, 10, 30*time.Second)
	if math.Abs(got-350) > 0.01 {
		t.Fatalf("ramp projection: got %v want 350", got)
	}
	// Flat or falling traffic keeps the model upper bound.
	if got := leadAdjustedLambda(300, 50, 0, 30*time.Second); got != 300 {
		t.Fatalf("flat: got %v want 300", got)
	}
	hist := []float32{10, 10, 10, 20, 30, 40}
	slope := recentSlope(hist, 3)
	// Window of 3 samples: indices [3,4,5] = 20,30,40. Delta 20 over 2 steps = 10.
	if math.Abs(slope-10) > 0.01 {
		t.Fatalf("slope: got %v want 10", slope)
	}
	if recentSlope([]float32{40, 30, 10}, 3) != 0 {
		t.Fatal("falling slope must not reduce the forecast")
	}
}

func TestScaleUpIsImmediate(t *testing.T) {
	p := ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 45 * time.Second,
		ScaleDownStep:          1,
	}
	// Even immediately after a previous change, scale-up is not delayed.
	d := applyScalePolicy(1, 8, 0, p)
	if d.Direction != "up" || d.Next != 8 {
		t.Fatalf("scale-up: %+v, want up to 8", d)
	}
	d = applyScalePolicy(2, 10, 5*time.Second, p)
	if d.Direction != "up" || d.Next != 10 {
		t.Fatalf("scale-up inside stabilization window: %+v", d)
	}
}

func TestScaleDownIsStabilizedAndStepped(t *testing.T) {
	p := ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 45 * time.Second,
		ScaleDownStep:          1,
	}
	// 10 -> 1 must not happen inside the window, or in a single step.
	d := applyScalePolicy(10, 1, 10*time.Second, p)
	if d.Direction != "hold" || d.Next != 10 {
		t.Fatalf("inside window: %+v, want hold at 10", d)
	}
	d = applyScalePolicy(10, 1, 45*time.Second, p)
	if d.Direction != "down" || d.Next != 9 {
		t.Fatalf("after window: %+v, want one step to 9", d)
	}
	d = applyScalePolicy(10, 1, time.Hour, p)
	if d.Next != 9 {
		t.Fatalf("step limit: got %d, 10 must not jump to 1", d.Next)
	}

	p.ScaleDownStep = 2
	d = applyScalePolicy(10, 1, time.Hour, p)
	if d.Direction != "down" || d.Next != 8 {
		t.Fatalf("step 2: %+v, want 8", d)
	}
	// Do not step past the desired count.
	d = applyScalePolicy(4, 3, time.Hour, p)
	if d.Next != 3 {
		t.Fatalf("step past desired: got %d want 3", d.Next)
	}
	// Warm floor.
	d = applyScalePolicy(2, 0, time.Hour, ScalePolicy{MinReplicas: 1, MaxReplicas: 10, ScaleDownStabilization: 0, ScaleDownStep: 5})
	if d.Next != 1 {
		t.Fatalf("floor: got %d want 1", d.Next)
	}
}

func TestReplicaCountNotUpdatedOnScaleError(t *testing.T) {
	next, ok := replicaCountAfterScale(10, 1, errors.New("k8s api scale failed"))
	if ok || next != 10 {
		t.Fatalf("error path: next=%d ok=%v, want 10 and false", next, ok)
	}
	next, ok = replicaCountAfterScale(10, 4, nil)
	if !ok || next != 4 {
		t.Fatalf("success path: next=%d ok=%v, want 4 and true", next, ok)
	}
}

func TestCapacityFeedbackMatchesTrainingScale(t *testing.T) {
	sla, waste := capacityFeedback(250, 1, 200)
	if sla != 1 || waste != 0 {
		t.Fatalf("overload: sla=%v waste=%v, want 1 and 0", sla, waste)
	}
	sla, waste = capacityFeedback(50, 2, 200)
	if sla != 0 || waste != 350 {
		t.Fatalf("spare capacity: sla=%v waste=%v, want 0 and 350 RPS", sla, waste)
	}
	// Zero SLA and zero waste is what the old monitor always sent. A loaded,
	// over-provisioned fleet must not collapse to that.
	if sla == 0 && waste == 0 {
		t.Fatal("waste must be visible to the DQN")
	}
}

func TestFeedbackWindowAverages(t *testing.T) {
	var w feedbackWindow
	w.size = 2
	s, waste := w.push(1, 0)
	if s != 1 || waste != 0 {
		t.Fatalf("first sample: %v %v", s, waste)
	}
	s, waste = w.push(0, 100)
	if math.Abs(float64(s)-0.5) > 0.01 || math.Abs(float64(waste)-50) > 0.01 {
		t.Fatalf("two-sample average: sla=%v waste=%v", s, waste)
	}
	s, _ = w.push(0, 0)
	if s != 0 {
		t.Fatalf("window should drop the oldest violation, sla=%v", s)
	}
}

func TestParseDeploymentScale(t *testing.T) {
	body := []byte(`{"kind":"Scale","apiVersion":"autoscaling/v1","spec":{"replicas":4},"status":{"replicas":2}}`)
	got, err := parseDeploymentScale(body)
	if err != nil || got != 4 {
		t.Fatalf("got %d err %v, want spec replicas 4", got, err)
	}
	if _, err := parseDeploymentScale([]byte("not-json")); err == nil {
		t.Fatal("expected unmarshal error")
	}
}

func TestNormalizePredictorTarget(t *testing.T) {
	if got := normalizePredictorTarget(""); got != "predictor:50051" {
		t.Fatalf("empty: %s", got)
	}
	if got := normalizePredictorTarget("http://predictor:50051"); got != "predictor:50051" {
		t.Fatalf("scheme: %s", got)
	}
	if got := normalizePredictorTarget("predictor.capstone.svc:50051"); got != "predictor.capstone.svc:50051" {
		t.Fatalf("custom: %s", got)
	}
	if strings.Contains(normalizePredictorTarget(" http://predictor:50051/ "), "http") {
		t.Fatal("scheme should be stripped")
	}
}
