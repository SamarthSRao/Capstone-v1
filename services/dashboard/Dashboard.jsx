import React, { useEffect, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MetricCard } from './components/MetricCard';
import { LocalSimulator } from './localSimulator';
import {
  chartPoint,
  explainDecision,
  fmtRps,
  mapStatus,
} from './statusView';

const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_URL || '';
const ORCHESTRATOR_URL = (
  import.meta.env.VITE_ORCHESTRATOR_URL || '/api/orchestrator'
).replace(/\/$/, '');

const STATUS_PATH = `${ORCHESTRATOR_URL}/api/target/status`;

async function fetchTelemetry() {
  if (ORCHESTRATOR_URL) {
    try {
      const response = await fetch(STATUS_PATH, { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data && data.live) return data;
      }
    } catch (err) {
      console.warn('[Dashboard] orchestrator status unavailable', err);
    }
  }

  if (!SIMULATOR_URL) {
    throw new Error('orchestrator status is not live');
  }

  const response = await fetch(`${SIMULATOR_URL}/metrics`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`simulator HTTP ${response.status}`);
  }
  return response.json();
}

function clockLabel(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function StatusPill({ link }) {
  const styles = {
    loading: 'border-slate-200 bg-slate-50 text-slate-600',
    live: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    offline: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  const label = link === 'live' ? 'Live' : link === 'offline' ? 'Disconnected' : 'Loading';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${styles[link] || styles.loading}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          link === 'live'
            ? 'bg-emerald-500'
            : link === 'offline'
              ? 'bg-rose-500'
              : 'bg-slate-400'
        }`}
      />
      {label}
    </span>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-console">
      <div className="mb-1 text-slate-500">{label}</div>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4">
            <span className="text-slate-600">{item.name}</span>
            <span className="font-medium tabular-nums text-slate-900">
              {fmtRps(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ruleChip(rule, scaling) {
  if (scaling === 'up') return 'Scale up';
  if (scaling === 'down') return 'Scale down';
  if (!rule) return 'Waiting';
  return rule;
}

export default function Dashboard() {
  const [history, setHistory] = useState([]);
  const [link, setLink] = useState('loading');
  const [events, setEvents] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('flash_sale');
  const [simStatus, setSimStatus] = useState('IDLE');

  useEffect(() => {
    let mounted = true;
    let lastEvent = '';

    const poll = async () => {
      try {
        const data = await fetchTelemetry();
        if (!mounted) return;
        const view = mapStatus(data);
        const point = chartPoint(view, clockLabel(new Date()));
        setLink('live');
        setSimStatus(view.status || 'LIVE');
        setHistory((previous) => [...previous, { ...point, view }].slice(-120));
        if (view.lastScaleEvent && view.lastScaleEvent !== lastEvent) {
          lastEvent = view.lastScaleEvent;
          setEvents((previous) =>
            [
              { time: point.time, text: view.lastScaleEvent, rule: view.scaleRule },
              ...previous,
            ].slice(0, 8),
          );
        }
      } catch (error) {
        console.error('[Dashboard] metrics error', error);
        if (mounted) setLink('offline');
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const latest = history[history.length - 1];
  const view = latest?.view;
  const why = view ? explainDecision(view) : [];

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-baseline gap-3">
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              HybridTimeNet
            </span>
            <span className="hidden text-xs text-slate-500 sm:inline">
              Autoscaler console
            </span>
          </div>
          <StatusPill link={link} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {link === 'loading' && !view ? (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-console">
            <p className="text-sm font-medium text-slate-700">Loading live status</p>
            <p className="mt-1 text-xs text-slate-500">
              Waiting for the first status poll.
            </p>
          </section>
        ) : null}

        {link === 'offline' && !view ? (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-console">
            <p className="text-sm font-medium text-slate-800">Status unavailable</p>
            <p className="mt-1 text-xs text-slate-500">{STATUS_PATH}</p>
          </section>
        ) : null}

        {view ? (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Replicas"
                value={`${view.activeReplicas}`}
                detail={`Desired ${view.desiredReplicas}`}
              />
              <MetricCard
                label="Live RPS"
                value={fmtRps(view.liveRps)}
                detail="Requests per second"
              />
              <MetricCard
                label="Forecast mean"
                value={fmtRps(view.forecastMean)}
                detail="Predictor mean"
              />
              <MetricCard
                label="Upper bound"
                value={fmtRps(view.upperBound)}
                detail="Published bound"
              />
              <MetricCard
                label="Z-score"
                value={view.zScore == null ? '—' : Number(view.zScore).toFixed(2)}
                detail={view.rlActionLabel || 'RL margin'}
              />
              <MetricCard
                label="Capacity"
                value={fmtRps(view.capacity)}
                detail={`${view.activeReplicas} pods × ${view.perPod} RPS`}
              />
              <MetricCard
                label="Scale decision"
                value={ruleChip(view.scaleRule, view.scaling)}
                detail={view.scaleRule || 'No rule yet'}
              />
              <MetricCard
                label="SLA"
                value={view.sla == null ? '—' : `${Number(view.sla).toFixed(1)}%`}
                detail={`${view.violations} violations`}
              />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-console">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Forecast, actual, and capacity
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Requests per second. The dashed indigo line is the published upper bound.
                  </p>
                </div>
              </div>
              <div className="h-80 w-full">
                {history.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Loading live status
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#eef0f3" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        label={{
                          value: 'RPS',
                          angle: -90,
                          position: 'insideLeft',
                          fill: '#94a3b8',
                          fontSize: 11,
                        }}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="capacity"
                        name="Capacity"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="Forecast mean"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="upper"
                        name="Upper bound"
                        stroke="#4f46e5"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="actual"
                        name="Actual"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-console lg:col-span-3">
                <h2 className="text-sm font-semibold text-slate-900">Why this decision</h2>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  {why.map((sentence) => (
                    <p key={sentence}>{sentence}</p>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-console lg:col-span-2">
                <h2 className="text-sm font-semibold text-slate-900">Recent scale events</h2>
                {events.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">No scale events yet.</p>
                ) : (
                  <table className="mt-3 w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="py-2 pr-3 font-medium">Time</th>
                        <th className="py-2 pr-3 font-medium">Rule</th>
                        <th className="py-2 font-medium">Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={`${event.time}-${event.text}`} className="border-b border-slate-50 align-top">
                          <td className="py-2 pr-3 tabular-nums text-slate-500">{event.time}</td>
                          <td className="py-2 pr-3">
                            <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                              {event.rule || '—'}
                            </span>
                          </td>
                          <td className="py-2 text-slate-700">{event.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          </>
        ) : null}

        <LocalSimulator
          simulatorUrl={SIMULATOR_URL}
          latestStatus={simStatus}
          selected={selectedDataset}
          setSelected={setSelectedDataset}
          onSimulationStarted={() => setHistory([])}
        />
      </main>
    </div>
  );
}
