// Pure view of GET /api/target/status. The dashboard must not recompute
// the upper bound: idle MC-dropout std is about 19, and mean + 1.96 * std
// is about 41. The orchestrator already publishes the capped bound on
// predicted_upper (about 14-17 at idle). AKS also sets predicted_mean equal
// to raw_ml_mean, so a series labelled "upper bound" must not plot
// predicted_mean.

export const RPS_PER_POD = 200;

const RULE_COPY = {
  'idle-guard':
    'Idle guard is holding the fleet. The published upper bound stays inside the flat headroom, so a noisy forecast does not add pods.',
  slope:
    'The slope rule is sizing the fleet. Live traffic is rising and the forecast mean is already near capacity.',
  'live-capacity':
    'Live capacity is the deciding rule. Current RPS is high enough that the fleet is sized from the live rate.',
  'forecast-persistence':
    'Forecast persistence is pre-scaling. The forecast mean has stayed above current capacity, ahead of live RPS.',
  'forecast-margin':
    'Forecast margin is pre-scaling. The lead of the forecast mean over live RPS is large enough to add capacity early.',
};

export function firstNumber(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const n = Number(item);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pick(data, keys) {
  for (const key of keys) {
    if (data && data[key] != null && data[key] !== '') return data[key];
  }
  return undefined;
}

export function mapStatus(data) {
  const source = data && typeof data === 'object' ? data : {};
  const active = firstNumber(
    pick(source, ['active_replicas', 'active_servers', 'activeServers']),
  );
  const desired = firstNumber(
    pick(source, [
      'desired_replicas',
      'required_servers',
      'requiredServers',
    ]),
  );
  const replicas = active == null ? 0 : active;
  const desiredReplicas = desired == null ? replicas : desired;
  const explicitCapacity = firstNumber(
    pick(source, ['capacity_rps', 'capacity']),
  );
  const rate = firstNumber(
    pick(source, ['service_rate_rps', 'serviceRateRps']),
  );
  const perPod = rate != null && rate > 0 ? rate : RPS_PER_POD;
  const capacity =
    explicitCapacity != null ? explicitCapacity : Math.max(0, replicas) * perPod;

  const rawMean = firstNumber(pick(source, ['raw_ml_mean', 'rawMlMean']));
  const predictedMean = firstNumber(
    pick(source, ['predicted_mean', 'predictedMean']),
  );

  return {
    liveRps: firstNumber(pick(source, ['current_rps', 'currentRPS'])) ?? 0,
    activeReplicas: replicas,
    desiredReplicas,
    forecastMean: rawMean != null ? rawMean : predictedMean,
    upperBound: firstNumber(
      pick(source, ['predicted_upper', 'predictedUpper']),
    ),
    lowerBound: firstNumber(
      pick(source, ['predicted_lower', 'predictedLower']),
    ),
    zScore: firstNumber(pick(source, ['z_score', 'zScore'])),
    stdDev: firstNumber(pick(source, ['std_dev', 'stdDev'])),
    capacity,
    perPod,
    scaleRule: String(pick(source, ['scale_rule', 'scaleRule']) || ''),
    scaling: String(pick(source, ['scaling']) || 'hold'),
    lastScaleEvent: String(
      pick(source, ['last_scale_event', 'lastScaleEvent']) || '',
    ),
    rlActionLabel: String(
      pick(source, ['rl_action_label', 'rlActionLabel']) || '',
    ),
    forecastLead: firstNumber(
      pick(source, ['forecast_lead_rps', 'forecastLeadRPS']),
    ),
    sla: firstNumber(pick(source, ['sla_reliability', 'slaReliability'])),
    violations: firstNumber(pick(source, ['violations'])) ?? 0,
    status: String(source.status || ''),
  };
}

export function chartPoint(view, time) {
  return {
    time,
    actual: view.liveRps,
    forecast: view.forecastMean,
    upper: view.upperBound,
    capacity: view.capacity,
  };
}

export function fmtRps(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const digits = Math.abs(n) < 20 ? 1 : 0;
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function explainDecision(view) {
  const sentences = [];
  if (view.scaleRule && RULE_COPY[view.scaleRule]) {
    sentences.push(RULE_COPY[view.scaleRule]);
  } else if (view.scaleRule) {
    sentences.push(`Scale rule ${view.scaleRule} is the current decision.`);
  } else {
    sentences.push('Waiting for a scale rule from the orchestrator.');
  }

  const direction =
    view.scaling === 'up'
      ? 'scale up'
      : view.scaling === 'down'
        ? 'scale down'
        : 'hold';
  const replicaWord = view.activeReplicas === 1 ? 'replica' : 'replicas';
  sentences.push(
    `Decision is ${direction}: ${view.activeReplicas} ${replicaWord} now, ${view.desiredReplicas} desired.`,
  );

  if (
    view.forecastMean != null &&
    view.upperBound != null
  ) {
    const lead =
      view.forecastLead != null
        ? ` Lead is ${fmtRps(view.forecastLead)} RPS.`
        : '';
    sentences.push(
      `Forecast mean ${fmtRps(view.forecastMean)} RPS, live ${fmtRps(view.liveRps)} RPS, upper bound ${fmtRps(view.upperBound)} RPS from predicted_upper.${lead} Capacity is ${fmtRps(view.capacity)} RPS at ${view.perPod} RPS per pod.`,
    );
  }

  if (view.zScore != null) {
    const action = view.rlActionLabel ? ` RL action ${view.rlActionLabel}.` : '';
    sentences.push(`Z-score is ${Number(view.zScore).toFixed(2)}.${action}`);
  }

  if (view.lastScaleEvent) {
    sentences.push(`Last scale event: ${view.lastScaleEvent}`);
  }

  return sentences;
}
