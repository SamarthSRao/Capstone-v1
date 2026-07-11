#!/usr/bin/env node
/**
 * HT-311: SLA Evaluator — polls simulator /metrics and reports compliance,
 * violations, total cost, and resource waste ratio.
 *
 * Usage:
 *   node scripts/sla-eval.js
 *   node scripts/sla-evaluator.mjs
 *   node scripts/sla-eval.js --url http://localhost:8083 --duration 120 --threshold 99
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
const COST_PER_SERVER_HOUR = Number(getArg('--cost-per-server-hour', '0.04'));

const samples = [];

async function fetchMetrics() {
  const res = await fetch(METRICS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function pad(str, width) {
  const s = String(str);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function padLeft(str, width) {
  const s = String(str);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function summarize() {
  if (samples.length === 0) {
    return { pass: false, reason: 'No samples collected — is docker compose up?' };
  }

  const reliabilities = samples.map((s) => s.sla_reliability ?? 100);
  const violations = samples.map((s) => s.violations ?? 0);
  const rps = samples.map((s) => s.current_rps ?? 0);
  const servers = samples.map((s) => s.active_servers ?? s.server_count ?? 1);
  const required = samples.map((s) => s.required_servers ?? s.active_servers ?? 1);

  const minReliability = Math.min(...reliabilities);
  const avgReliability = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;
  const maxRPS = Math.max(...rps);
  const finalViolations = violations[violations.length - 1];
  const avgServers = servers.reduce((a, b) => a + b, 0) / servers.length;

  const hours = samples.length / 3600;
  const totalCost = avgServers * hours * COST_PER_SERVER_HOUR;

  let wasteSum = 0;
  for (let i = 0; i < samples.length; i++) {
    const need = required[i] > 0 ? required[i] : 1;
    const have = servers[i];
    if (have > need) {
      wasteSum += (have - need) / have;
    }
  }
  const wasteRatio = (wasteSum / samples.length) * 100;

  const pass = samples.length >= MIN_SAMPLES && minReliability >= SLA_THRESHOLD;

  return {
    pass,
    samples: samples.length,
    minReliability: minReliability.toFixed(2),
    avgReliability: avgReliability.toFixed(2),
    maxRPS,
    finalViolations,
    avgServers: avgServers.toFixed(2),
    totalCost: totalCost.toFixed(4),
    wasteRatio: wasteRatio.toFixed(2),
    threshold: SLA_THRESHOLD,
    reason: pass
      ? `SLA held ≥ ${SLA_THRESHOLD}% for entire observation window`
      : minReliability < SLA_THRESHOLD
        ? `SLA dropped below ${SLA_THRESHOLD}% (min: ${minReliability.toFixed(2)}%)`
        : `Insufficient samples (need ${MIN_SAMPLES}, got ${samples.length})`,
  };
}

function printTable(result) {
  const rows = [
    ['Metric', 'Value'],
    ['Samples', String(result.samples ?? 0)],
    ['Min SLA Reliability', `${result.minReliability ?? '—'}%`],
    ['Avg SLA Reliability', `${result.avgReliability ?? '—'}%`],
    ['Peak RPS', String(result.maxRPS ?? '—')],
    ['Total Violations', String(result.finalViolations ?? '—')],
    ['Avg Active Servers', String(result.avgServers ?? '—')],
    ['Est. Compute Cost', `$${result.totalCost ?? '0.0000'}`],
    ['Resource Waste Ratio', `${result.wasteRatio ?? '0.00'}%`],
    ['SLA Threshold', `${result.threshold}%`],
    ['Result', result.pass ? 'PASS' : 'FAIL'],
  ];

  const col0 = Math.max(...rows.map((r) => r[0].length)) + 2;
  const col1 = Math.max(...rows.map((r) => r[1].length)) + 2;
  const line = `┌${'─'.repeat(col0)}┬${'─'.repeat(col1)}┐`;
  const mid = `├${'─'.repeat(col0)}┼${'─'.repeat(col1)}┤`;
  const end = `└${'─'.repeat(col0)}┴${'─'.repeat(col1)}┘`;

  console.log(line);
  console.log(`│${pad(rows[0][0], col0)}│${pad(rows[0][1], col1)}│`);
  console.log(mid);
  for (let i = 1; i < rows.length; i++) {
    console.log(`│${pad(rows[i][0], col0)}│${padLeft(rows[i][1], col1)}│`);
  }
  console.log(end);
}

async function main() {
  console.log(`[SLA Evaluator] Polling ${METRICS_URL}`);
  console.log(`[SLA Evaluator] Duration: ${DURATION_SEC}s | Threshold: ${SLA_THRESHOLD}%`);

  const deadline = Date.now() + DURATION_SEC * 1000;

  while (Date.now() < deadline) {
    try {
      const data = await fetchMetrics();
      samples.push(data);
      process.stdout.write(
        `\r  t=${samples.length}s  rps=${data.current_rps ?? 0}  sla=${(data.sla_reliability ?? 100).toFixed(1)}%  servers=${data.active_servers ?? '?'}  status=${data.status ?? '?'}  `
      );
    } catch (err) {
      process.stdout.write(`\r  [offline] ${err.message}                    `);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  console.log('\n');
  const result = summarize();

  console.log('─── SLA Evaluation Report ───');
  printTable(result);
  console.log(`  ${result.reason}`);
  console.log('──────────────────────────────');

  process.exit(result.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
