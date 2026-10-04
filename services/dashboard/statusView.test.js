import assert from 'node:assert/strict';
import test from 'node:test';
import { chartPoint, mapStatus, RPS_PER_POD } from './statusView.js';

// Idle AKS sample. Raw std stays ~19; the published upper bound is capped.
const idle = {
  live: true,
  status: 'LIVE',
  current_rps: 1.4,
  active_replicas: 1,
  desired_replicas: 1,
  scaling: 'hold',
  predicted_mean: 5.2,
  predicted_upper: 15.4,
  predicted_lower: 0,
  raw_ml_mean: 5.2,
  forecast_lead_rps: 3.8,
  scale_rule: 'idle-guard',
  std_dev: 19.1,
  z_score: 1.96,
  rl_action_label: 'HOLD',
  sla_reliability: 100,
  violations: 0,
  last_scale_event: 'System initialized at baseline (1 replica)',
};

test('upper bound is predicted_upper, not mean + z * raw std', () => {
  const view = mapStatus(idle);
  const recomputed = idle.predicted_mean + idle.z_score * idle.std_dev;
  assert.ok(recomputed > 40 && recomputed < 45);
  assert.equal(view.upperBound, 15.4);
  assert.notEqual(Math.round(view.upperBound), Math.round(recomputed));
});

test('forecast series is the raw mean, upper series is predicted_upper', () => {
  const view = mapStatus(idle);
  const point = chartPoint(view, '12:00:01');
  assert.equal(point.forecast, idle.raw_ml_mean);
  assert.equal(point.upper, idle.predicted_upper);
  assert.equal(point.actual, idle.current_rps);
  assert.notEqual(point.upper, point.forecast);
});

test('capacity uses 200 RPS per pod, not the old 50 RPS constant', () => {
  const view = mapStatus({ ...idle, active_replicas: 2, desired_replicas: 3 });
  assert.equal(RPS_PER_POD, 200);
  assert.equal(view.capacity, 400);
  assert.equal(view.perPod, 200);
  assert.notEqual(view.capacity, 2 * 50);
});

test('an explicit capacity on the payload wins over the default rate', () => {
  const view = mapStatus({ ...idle, capacity_rps: 180, service_rate_rps: 90 });
  assert.equal(view.capacity, 180);
  assert.equal(view.perPod, 90);
});
