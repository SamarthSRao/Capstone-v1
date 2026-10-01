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

func TestUpperBoundStaysCappedWhenSlopeIsOnlyJitter(t *testing.T) {
	// A few RPS/s used to bypass the cap and size from the raw upper bound.
	guard := ForecastGuard{FlatHeadroomRPS: 50, RisingSlope: 5}
	const mu = 200.0
	for _, slope := range []float64{2, 5, 20} {
		lambda := actionableForecast(1200, 40, slope, 30*time.Second, guard)
		got := ReplicasForLoad(lambda, mu, 1, 10)
		if got != 1 {
			t.Fatalf("slope %.0f upper 1200 -> lambda %.1f -> %d pods, want the idle cap", slope, lambda, got)
		}
		if lambda > 40+50 {
			t.Fatalf("slope %.0f escaped the headroom cap: %.1f", slope, lambda)
		}
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

func productionGuard() (ForecastGuard, PrescaleConfig) {
	g := ForecastGuard{FlatHeadroomRPS: 50, RisingSlope: 5, RisingFraction: 0.01}.normalized()
	c := PrescaleConfig{
		PersistTicks:     3,
		MarginCapRPS:     40,
		SmoothAlpha:      0.2,
		SlopeSustain:     3,
		SlopeWindow:      15,
		CapacityFraction: 0.70,
		SlopeHeadroom:    40,
		SlopeSizeMargin:  80,
	}.normalized()
	return g, c
}

func TestJitterBelowCapacityDoesNotScale(t *testing.T) {
	// Recorded failure: live RPS wandered through about 60-280, the slope
	// cleared 2 RPS/s on most ticks, and the raw upper bound (400-680) added
	// pods the fleet did not need. Two pods cover 280 RPS. The upper bound
	// must not add a third.
	guard, cfg := productionGuard()
	const mu = 200.0
	replicas := 2
	state := &PrescaleState{}
	hist := make([]float32, 24)
	for i := range hist {
		hist[i] = 160
	}
	uppers := []float64{400, 540, 680}
	for tick := 0; tick < 180; tick++ {
		// Fast oscillation inside [60, 280]. Net slope over 15s stays small
		// except on the rises, and those rises are not sitting at 70% of a
		// 400 RPS capacity with a slope that keeps climbing.
		rps := 170 + 110*math.Sin(float64(tick)*1.3)
		if rps < 60 {
			rps = 60
		}
		if rps > 280 {
			rps = 280
		}
		copy(hist, hist[1:])
		hist[len(hist)-1] = float32(rps)
		slope := recentSlope(hist, cfg.SlopeWindow)
		capacity := float64(replicas) * mu
		signal := decideScaleRate(uppers[tick%len(uppers)], 150, rps, slope, capacity, 30*time.Second, guard, cfg, state)
		next := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if next > replicas {
			t.Fatalf("tick %d rps %.0f slope %.2f rule %s lambda %.0f scaled %d -> %d", tick, rps, slope, signal.Rule, signal.Lambda, replicas, next)
		}
	}
}

func TestSustainedSlopeFarBelowCapacityDoesNotUseUpperBound(t *testing.T) {
	guard, cfg := productionGuard()
	const mu = 200.0
	state := &PrescaleState{}
	for tick := 0; tick < 12; tick++ {
		// Slope is real and held. Live RPS is 70, far under 70% of 200.
		// Upper bound 650 would be four pods if it were trusted.
		signal := decideScaleRate(650, 80, 70, 15, mu, 30*time.Second, guard, cfg, state)
		got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if got != 1 {
			t.Fatalf("tick %d rule %s lambda %.0f -> %d pods", tick, signal.Rule, signal.Lambda, got)
		}
	}
}

func TestLiveCrossScalesImmediatelyWithoutUpperBound(t *testing.T) {
	guard, cfg := productionGuard()
	const mu = 200.0
	state := &PrescaleState{}
	// First tick, no slope streak. Live is already over one pod. The upper
	// bound is below the live rate, so the decision has to come from live RPS.
	signal := decideScaleRate(100, 50, 250, 0, mu, 30*time.Second, guard, cfg, state)
	if signal.Rule != ruleLiveCapacity {
		t.Fatalf("rule %s, want live-capacity", signal.Rule)
	}
	got := ReplicasForLoad(signal.Lambda, mu, 1, 10)
	if got < 2 {
		t.Fatalf("live 250 did not add a pod: %+v -> %d", signal, got)
	}
	if got > 2 {
		t.Fatalf("sized past the live rate into %d pods (lambda %.0f)", got, signal.Lambda)
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

func TestRampFrom50To600ScalesAtOrBeforeCapacity(t *testing.T) {
	// 50 -> 600 RPS in 60s. The forecast mean tracks live RPS, so persistence
	// cannot pre-scale; the slope rule or the live crossing must. A constant
	// upper bound of 680 would ask for four pods on tick 1 if it were trusted.
	guard, cfg := productionGuard()
	const mu = 200.0
	state := &PrescaleState{}
	hist := make([]float32, 24)
	for i := range hist {
		hist[i] = 50
	}
	replicas := 1
	rps := 50.0
	step := (600.0 - 50.0) / 60.0
	crossedAt := map[int]int{}
	arrivedAt := map[int]float64{}
	for tick := 0; tick < 61; tick++ {
		copy(hist, hist[1:])
		hist[len(hist)-1] = float32(rps)
		slope := recentSlope(hist, cfg.SlopeWindow)
		capacity := float64(replicas) * mu
		signal := decideScaleRate(680, rps, rps, slope, capacity, 20*time.Second, guard, cfg, state)
		next := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if next > replicas {
			replicas = next
		}
		if _, seen := arrivedAt[replicas]; !seen {
			arrivedAt[replicas] = rps
		}
		// Needed pods for the live rate, plus one. A noisy 30s slope used to
		// jump well past that (4 -> 7 at ~612 RPS).
		needNow := ReplicasForLoad(rps, mu, 1, 10)
		if replicas > needNow+1 {
			t.Fatalf("tick %d rps %.0f slope %.2f rule %s lambda %.0f at %d pods, need at most %d", tick, rps, slope, signal.Rule, signal.Lambda, replicas, needNow+1)
		}
		for _, level := range []int{200, 400, 600} {
			if _, seen := crossedAt[level]; !seen && rps >= float64(level) {
				need := level/int(mu) + 1 // 200 -> 2, 400 -> 3, 600 saturated -> 4
				if level < 600 {
					need = level/int(mu) + 1
				}
				if level == 200 {
					need = 2
				} else if level == 400 {
					need = 3
				} else {
					need = 4
				}
				if replicas < need {
					t.Fatalf("rps %.0f crossed %d at tick %d with only %d pods (rule %s lambda %.0f slope %.2f)", rps, level, tick, replicas, signal.Rule, signal.Lambda, slope)
				}
				crossedAt[level] = tick
			}
		}
		rps += step
	}
	if replicas < 4 || replicas > 5 {
		t.Fatalf("ramp ended at %d pods; 600 RPS needs 4, and the slope cap allows at most one extra", replicas)
	}
	// Each extra pod has to be requested while live RPS is still under the
	// capacity it is there to cover.
	if got := arrivedAt[2]; got >= 200 {
		t.Fatalf("second pod arrived at %.0f RPS, want it before 200", got)
	}
	if got := arrivedAt[3]; got >= 400 {
		t.Fatalf("third pod arrived at %.0f RPS, want it before 400", got)
	}
	if got := arrivedAt[4]; got >= 600 {
		t.Fatalf("fourth pod arrived at %.0f RPS, want it before 600", got)
	}
}

func TestNoisySlopeAtPeakDoesNotOvershoot(t *testing.T) {
	// Kind retest: live 612 RPS, slope rule sized max(mean, live+slope*30s)+40
	// and jumped 4 -> 7. The forecast mean is near the live rate. A steep
	// window slope must not add more than one pod past what 612 RPS needs.
	guard, cfg := productionGuard()
	const mu = 200.0
	state := &PrescaleState{}
	replicas := 4
	for tick := 0; tick < 20; tick++ {
		signal := decideScaleRate(900, 620, 612, 40, float64(replicas)*mu, 20*time.Second, guard, cfg, state)
		next := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		if next > replicas {
			replicas = next
		}
	}
	need := ReplicasForLoad(612, mu, 1, 10)
	if replicas > need+1 {
		t.Fatalf("noisy slope sized %d pods at 612 RPS; need %d, allow at most one extra", replicas, need)
	}
	if replicas < need {
		t.Fatalf("noisy slope left %d pods at 612 RPS; need %d", replicas, need)
	}
}

func TestShortDipDoesNotCycleReplicas(t *testing.T) {
	// Kind retest: 1 -> 2, then ~45s later a scale-down at 127-146 RPS, then
	// another scale-up. The dip is shorter than the 100s stabilization window.
	guard, cfg := productionGuard()
	const mu = 200.0
	policy := ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 100 * time.Second,
		ScaleDownStep:          1,
	}
	state := &PrescaleState{}
	var demand demandTrack
	replicas := 1
	lastChange := 0
	hist := make([]float32, 24)
	for i := range hist {
		hist[i] = 80
	}
	rps := 80.0
	scaleUps := 0
	for tick := 0; tick < 80; tick++ {
		switch {
		case tick < 20:
			rps += 8
		case tick < 65:
			rps = 130 + float64((tick%5)*4)
		default:
			rps = 230
		}
		copy(hist, hist[1:])
		hist[len(hist)-1] = float32(rps)
		slope := recentSlope(hist, cfg.SlopeWindow)
		mean := rps
		if tick < 20 {
			mean = rps + 40
		}
		capacity := float64(replicas) * mu
		signal := decideScaleRate(680, mean, rps, slope, capacity, 20*time.Second, guard, cfg, state)
		desired := ReplicasForLoad(signal.Lambda, mu, 1, 10)
		peak := demand.push(mean, rps, 100)
		desired = limitScaleDown(replicas, desired, peak, mu, 1, 10)
		decision := applyScalePolicy(replicas, desired, time.Duration(tick-lastChange)*time.Second, policy)
		if decision.Direction == "up" || decision.Direction == "down" {
			if decision.Direction == "up" {
				scaleUps++
			}
			replicas = decision.Next
			lastChange = tick
		}
		if tick >= 20 && tick < 65 && replicas != 2 {
			t.Fatalf("dip tick %d rps %.0f replicas %d rule %s", tick, rps, replicas, signal.Rule)
		}
	}
	if replicas != 2 {
		t.Fatalf("ended at %d replicas after the second rise", replicas)
	}
	if scaleUps != 1 {
		t.Fatalf("scale-ups = %d, want one 1->2 and no second scale-up after the dip", scaleUps)
	}
}

func TestScaleDownWaitsForWindowPeakToFit(t *testing.T) {
	const mu = 200.0
	policy := ScalePolicy{
		MinReplicas:            1,
		MaxReplicas:            10,
		ScaleDownStabilization: 100 * time.Second,
		ScaleDownStep:          1,
	}
	var demand demandTrack
	replicas := 2
	// Ten seconds at 220 RPS, which needs two pods, then a long sit at 140.
	for tick := 0; tick < 10; tick++ {
		demand.push(220, 220, 100)
	}
	for tick := 10; tick < 110; tick++ {
		peak := demand.push(140, 140, 100)
		desired := limitScaleDown(replicas, ReplicasForLoad(140, mu, 1, 10), peak, mu, 1, 10)
		// Last change was the scale-up at tick 0.
		decision := applyScalePolicy(replicas, desired, time.Duration(tick)*time.Second, policy)
		if tick < 100 {
			if decision.Direction == "down" || decision.Next != 2 {
				t.Fatalf("tick %d scaled down inside 100s: %+v peak %.0f", tick, decision, peak)
			}
			continue
		}
		// The 220 RPS samples are still inside the 100-sample window until
		// they age out, so the timer alone must not drop the pod.
		if tick < 109 {
			if decision.Next != 2 {
				t.Fatalf("tick %d dropped a pod while the window peak is %.0f", tick, peak)
			}
			continue
		}
		if decision.Direction != "down" || decision.Next != 1 {
			t.Fatalf("tick %d peak %.0f: %+v, want one step to 1", tick, peak, decision)
		}
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
