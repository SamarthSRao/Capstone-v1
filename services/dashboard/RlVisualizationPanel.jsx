import React from 'react';
import {
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Brain, ArrowRight, Activity, Server, Zap, Target } from 'lucide-react';

const ACTION_META = {
  0: { label: 'Tighten −0.5', tone: 'text-sky-400', chip: 'bg-sky-500/10 border-sky-500/20' },
  1: { label: 'Tighten −0.1', tone: 'text-sky-300', chip: 'bg-sky-500/10 border-sky-500/20' },
  2: { label: 'Hold', tone: 'text-slate-300', chip: 'bg-slate-500/10 border-slate-500/20' },
  3: { label: 'Widen +0.5', tone: 'text-amber-300', chip: 'bg-amber-500/10 border-amber-500/20' },
  4: { label: 'Panic +2.0', tone: 'text-orange-400', chip: 'bg-orange-500/15 border-orange-500/30' },
};

const FLOW_STEPS = [
  {
    n: 1,
    title: 'Traffic arrives',
    explain: 'Checkout / simulation pushes real RPS into the system (white line on chart).',
  },
  {
    n: 2,
    title: 'ML forecasts load',
    explain: 'HybridTimeNet predicts next load from history (cyan line). Often lags sudden spikes.',
  },
  {
    n: 3,
    title: 'RL widens the band',
    explain: 'DQN agent raises z-score when prediction error grows → wider upper bound (amber line).',
  },
  {
    n: 4,
    title: 'Orchestrator sizes fleet',
    explain: 'Erlang-C converts RL upper bound into required server count (green steps).',
  },
  {
    n: 5,
    title: 'Fleet absorbs traffic',
    explain: 'Capacity = active servers × 50 RPS. If capacity ≥ traffic, SLA stays green.',
  },
];

function fmt(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function buildImpactSeries(history) {
  return history
    .filter((p) => p.actualRPS != null)
    .slice(-60)
    .map((p) => {
      const rawMl = p.rawMlMean;
      const mlOnlyServers = rawMl != null && rawMl > 0 ? Math.max(1, Math.ceil(rawMl / 50)) : null;
      return {
        time: p.time,
        actualRPS: p.actualRPS,
        mlForecast: rawMl,
        rlUpperBound: p.predictedUpper,
        fleetCapacity: (p.activeServers ?? 0) * 50,
        mlOnlyServers,
        rlServers: p.requiredServers,
        zScore: p.zScore,
      };
    });
}

function ImpactTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-white/10 bg-[#111113] px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-2">{label}</div>
      <div className="space-y-1 tabular-nums">
        <div className="text-white">Actual traffic: {fmt(d?.actualRPS)} RPS</div>
        <div className="text-cyan-300">ML forecast: {fmt(d?.mlForecast)} RPS</div>
        <div className="text-amber-300">RL scaling target: {fmt(d?.rlUpperBound)} RPS</div>
        <div className="text-emerald-300">Fleet capacity: {fmt(d?.fleetCapacity)} RPS</div>
        {d?.zScore != null && <div className="text-blue-300">RL z-score: {Number(d.zScore).toFixed(2)}</div>}
      </div>
    </div>
  );
}

function RlImpactChart({ history }) {
  const data = buildImpactSeries(history);
  if (data.length < 2) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-slate-500 border border-dashed border-white/[0.08] rounded-lg">
        Start a simulation — this chart will show how RL prediction diverges from ML when traffic spikes.
      </div>
    );
  }

  const peak = Math.max(...data.map((d) => d.actualRPS ?? 0), 100);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#ffffff08" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            domain={[0, Math.ceil(peak * 1.15)]}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip content={<ImpactTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span className="text-slate-400">{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="actualRPS"
            name="Actual traffic"
            stroke="#f8fafc"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="mlForecast"
            name="ML forecast (no RL)"
            stroke="#22d3ee"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="rlUpperBound"
            name="RL scaling target"
            stroke="#fbbf24"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="fleetCapacity"
            name="Fleet capacity (servers×50)"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ServerComparison({ latest }) {
  const rawMl = latest?.rawMlMean;
  const mlOnlyServers =
    rawMl != null && rawMl > 0 ? Math.max(1, Math.ceil(rawMl / 50)) : null;
  const rlServers = latest?.requiredServers ?? null;
  const delta =
    mlOnlyServers != null && rlServers != null ? rlServers - mlOnlyServers : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] px-4 py-3">
        <div className="text-[11px] text-cyan-400/80 mb-1">If ML forecast alone</div>
        <div className="text-2xl font-semibold text-slate-100 tabular-nums">
          {mlOnlyServers ?? '—'}
        </div>
        <div className="text-[11px] text-slate-500">servers @ {fmt(rawMl)} RPS</div>
      </div>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
        <div className="text-[11px] text-amber-400/80 mb-1">After RL adjustment</div>
        <div className="text-2xl font-semibold text-slate-100 tabular-nums">
          {rlServers ?? '—'}
        </div>
        <div className="text-[11px] text-slate-500">servers @ {fmt(latest?.predictedUpper)} RPS target</div>
      </div>
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
        <div className="text-[11px] text-emerald-400/80 mb-1">RL adds headroom</div>
        <div className="text-2xl font-semibold text-emerald-300 tabular-nums">
          {delta != null ? (delta >= 0 ? `+${delta}` : delta) : '—'}
        </div>
        <div className="text-[11px] text-slate-500">extra servers before peak hits</div>
      </div>
    </div>
  );
}

export function RlVisualizationPanel({ latest, history = [], live = false }) {
  const action = latest?.rlAction ?? null;
  const actionMeta = action != null ? ACTION_META[action] || ACTION_META[2] : null;
  const displayAction = latest?.rlActionLabel || actionMeta?.label || 'No action yet';
  const zScore = latest?.zScore;

  if (!live) {
    return (
      <section className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Brain size={16} className="text-slate-500" />
          How RL predicts &amp; handles traffic
        </h2>
        <ol className="space-y-2 text-sm text-slate-400 list-decimal list-inside">
          {FLOW_STEPS.map((s) => (
            <li key={s.n}>
              <span className="text-slate-300 font-medium">{s.title}</span> — {s.explain}
            </li>
          ))}
        </ol>
        <p className="text-xs text-slate-600 pt-2">
          Run Flash Sale simulation to populate the live impact chart below.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/[0.06] bg-[#0c0c0e] overflow-hidden space-y-0">
      {/* Mentor-facing headline */}
      <div className="px-6 py-5 border-b border-white/[0.06] bg-blue-500/[0.03]">
        <h2 className="text-base font-semibold text-slate-100 mb-1">
          How RL predicts load &amp; protects traffic
        </h2>
        <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
          RL does <span className="text-slate-200">not</span> replace the ML forecaster — it watches live traffic,
          detects when the ML forecast is too low, and <span className="text-amber-300">widens the prediction band</span>
          so the orchestrator provisions servers <span className="text-emerald-300">before</span> traffic overwhelms capacity.
        </p>
      </div>

      {/* Numbered flow for mentor */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {FLOW_STEPS.map((step, i) => (
            <div key={step.n} className="relative">
              <div className="flex items-start gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[11px] font-bold text-blue-300">
                  {step.n}
                </span>
                <div>
                  <div className="text-xs font-medium text-slate-200">{step.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{step.explain}</div>
                </div>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <ArrowRight size={12} className="text-slate-700 absolute -right-1 top-2 hidden md:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Live pipeline with current numbers */}
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-[11px] text-slate-500">Live control loop (updates every second)</span>
          {actionMeta && (
            <span className={`text-xs px-2.5 py-1 rounded-md border ${actionMeta.chip} ${actionMeta.tone}`}>
              RL action: {displayAction}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-stretch gap-2 text-sm">
          {[
            { icon: Activity, label: 'Traffic', val: `${fmt(latest?.actualRPS)} RPS` },
            { icon: Brain, label: 'ML says', val: `${fmt(latest?.rawMlMean)} RPS` },
            { icon: Target, label: 'RL z-score', val: zScore != null ? zScore.toFixed(2) : '—' },
            { icon: Zap, label: 'RL target', val: `${fmt(latest?.predictedUpper)} RPS` },
            { icon: Server, label: 'Fleet', val: `${fmt(latest?.activeServers)} / ${fmt(latest?.requiredServers)} srv` },
          ].map(({ icon: Icon, label, val }, i, arr) => (
            <React.Fragment key={label}>
              <div className="flex-1 min-w-[100px] rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-1.5 text-slate-500 text-[10px] mb-0.5">
                  <Icon size={12} /> {label}
                </div>
                <div className="text-slate-200 font-medium tabular-nums">{val}</div>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight size={14} className="text-slate-600 self-center shrink-0 hidden lg:block" />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Main impact chart — the visual your mentor needs */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-slate-200">Traffic vs prediction vs capacity</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            When the white line (traffic) crosses above cyan (ML alone), amber (RL target) and green (fleet capacity) rise to stay ahead.
          </p>
        </div>
        <RlImpactChart history={history} />
      </div>

      {/* Server comparison */}
      <div className="px-6 py-5">
        <h3 className="text-sm font-medium text-slate-200 mb-3">RL impact on provisioning</h3>
        <ServerComparison latest={latest} />
      </div>
    </section>
  );
}

export default RlVisualizationPanel;
