import React from 'react';
import { ShieldAlert, DollarSign, Gauge, AlertOctagon } from 'lucide-react';

/** Simulated Fargate-ish cost per server-hour (USD). */
const COST_PER_SERVER_HOUR = 0.04;
const SERVER_CAPACITY_RPS = 50;

/**
 * HT-703 — Live SLA violations + cost-efficiency gauges.
 */
export function SlaCostVisualizer({ latest, chartData }) {
  const sla = latest?.slaReliability ?? 100;
  const violations = latest?.violations ?? 0;
  const servers = Math.max(1, latest?.activeServers ?? 1);
  const rps = latest?.actualRPS ?? 0;
  const required = latest?.requiredServers ?? servers;

  const utilization = Math.min(100, (rps / (servers * SERVER_CAPACITY_RPS)) * 100);
  const wastePct = required > 0 && servers > required
    ? ((servers - required) / servers) * 100
    : 0;

  // Approximate running cost from observation window length
  const hours = Math.max(chartData.length, 1) / 3600;
  const sessionCost = servers * hours * COST_PER_SERVER_HOUR;
  const projectedHourly = servers * COST_PER_SERVER_HOUR;

  const slaCritical = sla < 99;
  const slaWarn = sla < 99.5;

  const slaColor = slaCritical ? '#ef4444' : slaWarn ? '#f59e0b' : '#22c55e';
  const utilColor = utilization > 90 ? '#ef4444' : utilization > 70 ? '#f59e0b' : '#22c55e';

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
      <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2 uppercase tracking-widest">
        <Gauge size={16} className="text-cyan-400" /> SLA & Cost Efficiency
      </h4>
      <p className="text-xs text-slate-500 mb-5">
        Live reliability, violation count, and simulated fleet spend.
      </p>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <GaugeRing
          label="SLA Reliability"
          value={sla}
          suffix="%"
          color={slaColor}
          critical={slaCritical}
        />
        <GaugeRing
          label="Fleet Utilization"
          value={utilization}
          suffix="%"
          color={utilColor}
        />
      </div>

      <div className="space-y-3">
        <MetricRow
          icon={AlertOctagon}
          label="SLA Violations"
          value={String(violations)}
          accent={violations > 0 ? 'text-red-400' : 'text-emerald-400'}
          blink={violations > 0 && slaCritical}
        />
        <MetricRow
          icon={ShieldAlert}
          label="Resource Waste"
          value={`${wastePct.toFixed(1)}%`}
          accent={wastePct > 25 ? 'text-amber-400' : 'text-slate-300'}
        />
        <MetricRow
          icon={DollarSign}
          label="Projected $/hr"
          value={`$${projectedHourly.toFixed(3)}`}
          accent="text-cyan-300"
        />
        <MetricRow
          icon={DollarSign}
          label="Session Cost (est.)"
          value={`$${sessionCost.toFixed(4)}`}
          accent="text-slate-300"
        />
      </div>
    </div>
  );
}

function GaugeRing({ label, value, suffix, color, critical }) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className={`flex flex-col items-center p-3 rounded-xl border border-white/5 bg-black/30 ${
        critical ? 'animate-pulse ring-1 ring-red-500/40' : ''
      }`}
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        <svg width="96" height="96" className="absolute inset-0 -rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.4s ease' }}
          />
        </svg>
        <div className="text-lg font-bold tabular-nums z-10" style={{ color }}>
          {clamped.toFixed(1)}{suffix}
        </div>
      </div>
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-1 text-center">
        {label}
      </div>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, accent, blink }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg bg-black/40 border border-white/5 ${
        blink ? 'animate-pulse border-red-500/40' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon size={14} className={accent} />
        {label}
      </div>
      <div className={`text-sm font-bold tabular-nums ${accent}`}>{value}</div>
    </div>
  );
}
