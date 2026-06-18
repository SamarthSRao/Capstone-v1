#!/usr/bin/env node
/**
 * HT-311: SLA Evaluator — polls simulator /metrics and reports pass/fail.
 *
 * Usage:
 *   node scripts/sla-evaluator.mjs
 *   node scripts/sla-evaluator.mjs --url http://localhost:8083 --duration 120 --threshold 99
 */

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  return args[idx + 1];
}

const METRICS_URL = `${getArg('--url', process.env.SIMULATOR_URL || 'http://localhost:8083')}/metrics`;
const DURATION_SEC = Number(getArg('--duration', '60'));
const INTERVAL_MS = Number(getArg('--interval', '1000'));
const SLA_THRESHOLD = Number(getArg('--threshold', '99'));
const MIN_SAMPLES = Number(getArg('--min-samples', '10'));

const samples = [];

async function fetchMetrics() {
  const res = await fetch(METRICS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function summarize() {
  if (samples.length === 0) {
    return { pass: false, reason: 'No samples collected — is docker compose up?' };
  }

  const reliabilities = samples.map((s) => s.sla_reliability ?? 100);
  const violations = samples.map((s) => s.violations ?? 0);
  const rps = samples.map((s) => s.current_rps ?? 0);

  const minReliability = Math.min(...reliabilities);
  const avgReliability = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;
  const maxRPS = Math.max(...rps);
  const finalViolations = violations[violations.length - 1];

  const pass = samples.length >= MIN_SAMPLES && minReliability >= SLA_THRESHOLD;

  return {
    pass,
    samples: samples.length,
    minReliability: minReliability.toFixed(2),
    avgReliability: avgReliability.toFixed(2),
    maxRPS,
    finalViolations,
    threshold: SLA_THRESHOLD,
    reason: pass
      ? `SLA held ≥ ${SLA_THRESHOLD}% for entire observation window`
      : minReliability < SLA_THRESHOLD
        ? `SLA dropped below ${SLA_THRESHOLD}% (min: ${minReliability.toFixed(2)}%)`
        : `Insufficient samples (need ${MIN_SAMPLES}, got ${samples.length})`,
  };
}

console.log(`[SLA Evaluator] Polling ${METRICS_URL}`);
console.log(`[SLA Evaluator] Duration: ${DURATION_SEC}s | Threshold: ${SLA_THRESHOLD}%`);

const deadline = Date.now() + DURATION_SEC * 1000;

while (Date.now() < deadline) {
  try {
    const data = await fetchMetrics();
    samples.push(data);
    process.stdout.write(
      `\r  t=${samples.length}s  rps=${data.current_rps ?? 0}  sla=${(data.sla_reliability ?? 100).toFixed(1)}%  status=${data.status ?? '?'}  `
    );
  } catch (err) {
    process.stdout.write(`\r  [offline] ${err.message}                    `);
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.log('\n');
const result = summarize();

console.log('─── SLA Evaluation Report ───');
console.log(`  Samples:         ${result.samples}`);
console.log(`  Min reliability: ${result.minReliability}%`);
console.log(`  Avg reliability: ${result.avgReliability}%`);
console.log(`  Peak RPS:        ${result.maxRPS}`);
console.log(`  Final violations:${result.finalViolations}`);
console.log(`  Threshold:       ${result.threshold}%`);
console.log(`  Result:          ${result.pass ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`  ${result.reason}`);
console.log('──────────────────────────────');

process.exit(result.pass ? 0 : 1);
