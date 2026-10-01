package main

import (
	"encoding/json"
	"math"
	"sort"
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

// ForecastGuard decides when a model upper bound is allowed to add pods.
//
// At idle the predictor's mean stays near 70 RPS while Monte Carlo dropout
// makes std jump around ~100 RPS, and that noisy std is also an input to the
// DQN, so z moves with it. The published bound is mean + z*std (the error
// term is zero when live RPS is below the mean). With z around 2 that is
// ~280 RPS, and a one-tick panic step or a fat std sample reaches ~440.
// Both sit on the 200 RPS/pod boundary, so the actuator flapped 1 -> 2 and
// sometimes 1 -> 3, then the scale-down window brought the pod back.
//
// FlatHeadroomRPS is added to the live rate when no ramp rule is active.
// It must stay below the per-pod service rate so that noise cannot cross
// into a second pod.
//
// RisingSlope is the minimum RPS/s of a ramp. RisingFraction raises that
// bar with capacity (1% of capacity per second at the default), so a
// 2 RPS/s wiggle on a busy pod is not a ramp. Neither value, on its own,
// unlocks the raw upper bound.
type ForecastGuard struct {
	FlatHeadroomRPS float64
	RisingSlope     float64
	RisingFraction  float64
}

func (g ForecastGuard) normalized() ForecastGuard {
	if g.FlatHeadroomRPS < 0 || math.IsNaN(g.FlatHeadroomRPS) {
		g.FlatHeadroomRPS = 0
	}
	if g.RisingSlope <= 0 || math.IsNaN(g.RisingSlope) {
		g.RisingSlope = 5
	}
	if g.RisingFraction < 0 || math.IsNaN(g.RisingFraction) {
		g.RisingFraction = 0
	}
	return g
}

// slopeThreshold is the RPS/s a window must clear before a tick counts
// toward a sustained ramp. The fraction term grows with the current fleet
// so the same absolute jitter does not qualify on a larger capacity.
func (g ForecastGuard) slopeThreshold(capacity float64) float64 {
	g = g.normalized()
	rel := 0.0
	if capacity > 0 {
		rel = g.RisingFraction * capacity
	}
	if rel > g.RisingSlope {
		return rel
	}
	return g.RisingSlope
}

// Rule names are logged on every scale action and returned on the status JSON.
// idle-guard is the capped upper bound. slope and live-capacity size from
// the forecast mean and the live rate. The forecast-* rules are the mean
// pre-scale, which may add pods while live RPS is still flat.
const (
	ruleIdleGuard    = "idle-guard"
	ruleSlope        = "slope"
	ruleLiveCapacity = "live-capacity"
	rulePersistence  = "forecast-persistence"
	ruleMargin       = "forecast-margin"
)

// PrescaleConfig is the mean-based path. It does not cap that path with
// FLAT_HEADROOM_RPS; that cap stays on the upper bound only.
//
// PersistTicks is how long the raw forecast mean must sit above current
// capacity before it is trusted. MarginCapRPS is the most the smoothed
// lead (mean minus live RPS) may add, and it has to stay well below the
// per-pod rate or an idle mean near 70 RPS would clear 200. SmoothAlpha
// is the EMA weight. A single spiked mean sample therefore cannot cross
// a pod boundary from a quiet baseline.
type PrescaleConfig struct {
	PersistTicks int
	MarginCapRPS float64
	SmoothAlpha  float64
	// SlopeSustain is how many consecutive ticks must clear the slope
	// threshold. SlopeWindow is the history the monitor averages over;
	// decideScaleRate itself is given the already-computed slope.
	// CapacityFraction is the share of current capacity the smoothed live
	// rate (or the forecast mean) must already have reached. SlopeHeadroom
	// is added after the capped projection. It stays well under one pod.
	// SlopeSizeMargin caps that projection at the forecast mean plus this
	// many RPS, so a noisy slope cannot size several pods past the mean.
	// PrescaleFraction is the share of current capacity (default 80%) at
	// which the forecast mean, or a rising smoothed live rate, requests
	// the next pod. It is earlier than waiting for the mean to clear 100%.
	// MarginFraction raises the lead-margin cap with capacity (20% of the
	// current fleet). LiveMedianTicks is the short window whose median is
	// the live rate used for sizing, so one sample cannot set the replica count.
	SlopeSustain     int
	SlopeWindow      int
	CapacityFraction float64
	SlopeHeadroom    float64
	SlopeSizeMargin  float64
	PrescaleFraction float64
	MarginFraction   float64
	LiveMedianTicks  int
}

func (c PrescaleConfig) normalized() PrescaleConfig {
	if c.PersistTicks < 1 {
		c.PersistTicks = 3
	}
	if c.MarginCapRPS < 0 || math.IsNaN(c.MarginCapRPS) {
		c.MarginCapRPS = 0
	}
	if c.SmoothAlpha <= 0 || c.SmoothAlpha > 1 || math.IsNaN(c.SmoothAlpha) {
		c.SmoothAlpha = 0.2
	}
	if c.SlopeSustain < 1 {
		c.SlopeSustain = 3
	}
	if c.SlopeWindow < 2 {
		c.SlopeWindow = 15
	}
	if c.CapacityFraction <= 0 || c.CapacityFraction > 1 || math.IsNaN(c.CapacityFraction) {
		c.CapacityFraction = 0.70
	}
	if c.SlopeHeadroom < 0 || math.IsNaN(c.SlopeHeadroom) {
		c.SlopeHeadroom = 40
	}
	if c.SlopeSizeMargin <= 0 || math.IsNaN(c.SlopeSizeMargin) {
		c.SlopeSizeMargin = 80
	}
	if c.PrescaleFraction <= 0 || c.PrescaleFraction > 1 || math.IsNaN(c.PrescaleFraction) {
		c.PrescaleFraction = 0.80
	}
	if c.MarginFraction <= 0 || c.MarginFraction > 1 || math.IsNaN(c.MarginFraction) {
		c.MarginFraction = 0.20
	}
	if c.LiveMedianTicks < 1 {
		c.LiveMedianTicks = 3
	}
	return c
}

// PrescaleState is the memory across ticks: how long the mean has been
// above capacity, and the smoothed mean and lead margin.
type PrescaleState struct {
	AboveCapacity int
	MeanEMA       float64
	MarginEMA     float64
	LiveEMA       float64
	SlopeEMA      float64
	SlopeStreak   int
	FractionTicks int
	liveSamples   []float64
	primed        bool
}

// ScaleSignal is the arrival rate the actuator may turn into a replica count,
// and which rule produced it.
type ScaleSignal struct {
	Lambda    float64
	Rule      string
	SizingRPS float64
}

// decideScaleRate combines the idle cap, mean pre-scaling, and a slope
// rule that does not read the raw upper bound.
//
// The upper bound is Monte Carlo dropout noise. It is only allowed through
// the idle cap (live RPS + FlatHeadroomRPS). A slope-triggered scale-up
// fires when three things are true together: the windowed slope has cleared
// its threshold for SlopeSustain ticks, the smoothed live rate or the forecast
// mean is already at CapacityFraction of current capacity, and the smoothed
// slope carried across pod start (or the forecast mean, whichever is larger)
// plus a small headroom would exceed capacity. Sizing uses an EMA of the
// windowed slope, and when the forecast mean is present that projection is
// capped at the mean plus SlopeSizeMargin. The raw upper bound is not an input.
//
// The forecast mean requests the next pod once it has sat at
// PrescaleFraction of capacity (default 80%) for PersistTicks, or on
// the same tick if a real rise is already underway. A rising smoothed
// live rate (the median of the last few samples, not one spike) does
// the same when the mean is behind. Idle noise does not: the mean has
// to hold, or the live median has to be rising for SlopeSustain ticks.
//
// Live RPS at or above current capacity scales on that same tick
// (live-capacity) once the median, not a single sample, has crossed.
// Capacity is the current fleet times the per-pod service rate.
func decideScaleRate(upperBound, mean, currentRPS, slopePerSec, capacity float64, lead time.Duration, guard ForecastGuard, cfg PrescaleConfig, state *PrescaleState) ScaleSignal {
	guard = guard.normalized()
	cfg = cfg.normalized()
	if state == nil {
		state = &PrescaleState{}
	}
	if currentRPS < 0 || math.IsNaN(currentRPS) {
		currentRPS = 0
	}
	if slopePerSec < 0 || math.IsNaN(slopePerSec) {
		slopePerSec = 0
	}
	if math.IsNaN(mean) || mean < 0 {
		mean = 0
	}
	if math.IsNaN(capacity) || capacity < 0 {
		capacity = 0
	}
	if lead < 0 {
		lead = 0
	}

	// Prime from live RPS, not from the first mean. A cold start on a
	// spiked sample would otherwise look like a sustained forecast.
	if !state.primed {
		state.MeanEMA = currentRPS
		state.LiveEMA = currentRPS
		state.MarginEMA = 0
		state.primed = true
	}
	alpha := cfg.SmoothAlpha
	sizingLive := state.pushLiveMedian(currentRPS, cfg.LiveMedianTicks)
	state.MeanEMA = alpha*mean + (1-alpha)*state.MeanEMA
	state.LiveEMA = alpha*currentRPS + (1-alpha)*state.LiveEMA
	marginCap := cfg.MarginCapRPS
	if capacity > 0 {
		proportional := cfg.MarginFraction * capacity
		if proportional > marginCap {
			marginCap = proportional
		}
	}
	gap := mean - sizingLive
	if gap < 0 {
		gap = 0
	}
	if gap > marginCap {
		gap = marginCap
	}
	state.MarginEMA = alpha*gap + (1-alpha)*state.MarginEMA

	if mean > capacity {
		state.AboveCapacity++
	} else {
		state.AboveCapacity = 0
	}
	if slopePerSec >= guard.slopeThreshold(capacity) {
		state.SlopeStreak++
	} else {
		state.SlopeStreak = 0
	}
	// Size from the smoothed slope. A 15s window can still read a dip-then-spike
	// as a steep ramp; the EMA keeps one noisy window from adding several pods.
	// The streak above still uses the windowed slope, so a real ramp qualifies
	// as soon as that window clears the threshold.
	state.SlopeEMA = alpha*slopePerSec + (1-alpha)*state.SlopeEMA

	// Idle cap. The median live rate is the ceiling, so one sample of 657 RPS
	// cannot size the fleet. Slope is passed as 0 so a jittery rise cannot
	// lift the cap either.
	best := ScaleSignal{
		Lambda:    actionableForecast(upperBound, sizingLive, 0, lead, guard),
		Rule:      ruleIdleGuard,
		SizingRPS: sizingLive,
	}
	consider := func(lambda float64, rule string) {
		if lambda > best.Lambda {
			best = ScaleSignal{Lambda: lambda, Rule: rule, SizingRPS: sizingLive}
		}
	}

	fractionLine := 0.0
	if capacity > 0 {
		fractionLine = cfg.PrescaleFraction * capacity
	}
	if capacity > 0 && mean >= fractionLine {
		state.FractionTicks++
	} else {
		state.FractionTicks = 0
	}

	if state.AboveCapacity >= cfg.PersistTicks {
		// The mean itself, not the upper bound and not a one-window slope.
		consider(mean, rulePersistence)
	} else if capacity > 0 && mean >= fractionLine && (state.FractionTicks >= cfg.PersistTicks || state.SlopeStreak >= cfg.SlopeSustain) {
		// 80% of the current pods, held or confirmed by a rise. Size at
		// least at the pod boundary so this requests the next pod, and at
		// the mean when the mean is already higher.
		rate := mean
		if capacity > rate {
			rate = capacity
		}
		consider(rate, rulePersistence)
	} else if state.MeanEMA+state.MarginEMA > capacity && state.MarginEMA > 0 {
		consider(state.MeanEMA+state.MarginEMA, ruleMargin)
	}

	if sizingLive < capacity && state.SlopeStreak >= cfg.SlopeSustain && capacity > 0 {
		near := state.LiveEMA >= cfg.CapacityFraction*capacity || mean >= cfg.CapacityFraction*capacity
		if near {
			projected := slopeProjection(sizingLive, mean, state.SlopeEMA, lead, cfg) + cfg.SlopeHeadroom
			if projected > capacity {
				consider(projected, ruleSlope)
			}
		}
		// Mean can sit under 80% on a real ramp. The median live rate, once
		// it is there and the rise has held, still requests the next pod.
		if sizingLive >= fractionLine {
			rate := sizingLive
			if mean > rate {
				rate = mean
			}
			if capacity > rate {
				rate = capacity
			}
			consider(rate, ruleSlope)
		}
	}

	if capacity > 0 && sizingLive >= capacity {
		rate := sizingLive
		if mean > rate {
			rate = mean
		}
		// A single spiked sample can clear capacity. Only a slope that has
		// already held for SlopeSustain ticks may look further ahead, and
		// that look-ahead is the smoothed slope, capped near the mean.
		if state.SlopeStreak >= cfg.SlopeSustain {
			ahead := slopeProjection(sizingLive, mean, state.SlopeEMA, lead, cfg)
			if ahead > rate {
				rate = ahead
			}
		}
		consider(rate+cfg.SlopeHeadroom, ruleLiveCapacity)
	}
	return best
}

func (s *PrescaleState) pushLiveMedian(sample float64, window int) float64 {
	if window < 1 {
		window = 3
	}
	if math.IsNaN(sample) || sample < 0 {
		sample = 0
	}
	s.liveSamples = append(s.liveSamples, sample)
	if len(s.liveSamples) > window {
		s.liveSamples = s.liveSamples[len(s.liveSamples)-window:]
	}
	return medianRPS(s.liveSamples)
}

func medianRPS(values []float64) float64 {
	n := len(values)
	if n == 0 {
		return 0
	}
	tmp := append([]float64(nil), values...)
	sort.Float64s(tmp)
	if n%2 == 1 {
		return tmp[n/2]
	}
	return (tmp[n/2-1] + tmp[n/2]) / 2
}

// slopeProjection is max(forecast mean, live RPS carried by the smoothed
// slope for the pod-start lead). When the mean is available the result
// cannot pass mean + SlopeSizeMargin, and it cannot pass below live RPS:
// a lagging mean must not hide traffic that is already here. The upper
// bound is not an input.
func slopeProjection(currentRPS, mean, slopePerSec float64, lead time.Duration, cfg PrescaleConfig) float64 {
	cfg = cfg.normalized()
	projected := extrapolateLive(currentRPS, mean, slopePerSec, lead)
	if mean > 0 && !math.IsNaN(mean) {
		ceiling := mean + cfg.SlopeSizeMargin
		if ceiling < currentRPS {
			ceiling = currentRPS
		}
		if projected > ceiling {
			projected = ceiling
		}
	}
	return projected
}

// extrapolateLive is max(forecast mean, live RPS carried forward by the
// slope for the pod-start lead). The upper bound is not an input.
func extrapolateLive(currentRPS, mean, slopePerSec float64, lead time.Duration) float64 {
	projected := currentRPS + slopePerSec*lead.Seconds()
	if projected < 0 || math.IsNaN(projected) {
		projected = 0
	}
	if math.IsNaN(mean) || mean < 0 {
		mean = 0
	}
	if mean > projected {
		return mean
	}
	return projected
}

// actionableForecast caps the upper bound at live RPS + headroom.
// A rising slope used to return the raw bound from here. Jitter of a few
// RPS/s then sized the fleet from MC-dropout spikes (400-680) while live
// RPS was still inside the pods already running. That bypass is gone.
func actionableForecast(upperBound, currentRPS, slopePerSec float64, lead time.Duration, guard ForecastGuard) float64 {
	guard = guard.normalized()
	if currentRPS < 0 || math.IsNaN(currentRPS) {
		currentRPS = 0
	}
	if slopePerSec < 0 || math.IsNaN(slopePerSec) {
		slopePerSec = 0
	}
	projected := leadAdjustedLambda(upperBound, currentRPS, slopePerSec, lead)
	ceiling := currentRPS + guard.FlatHeadroomRPS
	if projected > ceiling {
		return ceiling
	}
	return projected
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

// demandTrack is one sample per second of max(forecast mean, live RPS).
// Scale-down looks at the max over the stabilization window.
type demandTrack struct {
	samples []float64
}

func (d *demandTrack) push(mean, live float64, window int) float64 {
	sample := live
	if math.IsNaN(sample) || sample < 0 {
		sample = 0
	}
	if !math.IsNaN(mean) && mean > sample {
		sample = mean
	}
	if window < 1 {
		window = 1
	}
	d.samples = append(d.samples, sample)
	if len(d.samples) > window {
		d.samples = d.samples[len(d.samples)-window:]
	}
	peak := 0.0
	for _, s := range d.samples {
		if s > peak {
			peak = s
		}
	}
	return peak
}

// limitScaleDown refuses a scale-down when the peak of forecast mean and
// live RPS over the stabilization window still needs the pods that are
// running. A dip inside that window then cannot drop a pod the next rise
// would put straight back. Scale-up is unchanged. The step limit stays in
// applyScalePolicy.
func limitScaleDown(current, desired int, peak, mu float64, minR, maxR int) int {
	if desired >= current {
		return desired
	}
	need := ReplicasForLoad(peak, mu, minR, maxR)
	if need >= current {
		return current
	}
	if desired < need {
		return need
	}
	return desired
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
