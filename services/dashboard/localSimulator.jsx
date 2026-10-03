import React, { useEffect, useState } from 'react';

const DATASETS = {
  organic: {
    label: 'Organic traffic',
    description: 'Steady baseline, 50 to 100 RPS',
    data: [
      50, 52, 55, 58, 60, 62, 65, 63, 70, 72,
      68, 75, 78, 80, 76, 72, 70, 68, 65, 60,
      58, 55, 60, 62, 65, 70, 72, 75, 78, 80,
      82, 80, 78, 75, 72, 70, 68, 65, 62, 60,
    ],
  },
  flash_sale: {
    label: 'Flash sale spike',
    description: 'Organic baseline, then a 2,500 RPS spike',
    data: [
      50, 55, 60, 65, 70, 80, 100, 200, 500, 1000,
      1800, 2200, 2500, 2500, 2400, 2000, 1500, 1000,
      600, 400, 250, 150, 100, 80, 65, 55, 50, 50,
      50, 50,
    ],
  },
  nasa_trace: {
    label: 'NASA HTTP trace',
    description: '1995 NASA server traffic pattern',
    data: [
      120, 135, 140, 180, 210, 350, 620, 980, 1200, 1450,
      1600, 1580, 1420, 1300, 1200, 1100, 980, 850, 720,
      600, 480, 380, 280, 200, 160, 140, 130, 125, 120,
      118,
    ],
  },
  calgary_trace: {
    label: 'Calgary HTTP trace',
    description: 'University server, sharp midday spike',
    data: [
      80, 85, 90, 95, 100, 120, 180, 320, 580, 850,
      1100, 1250, 1100, 900, 750, 600, 480, 380, 280,
      200, 160, 130, 110, 95, 88, 85, 82, 80, 80, 80,
    ],
  },
};

export function LocalSimulator({
  simulatorUrl,
  latestStatus,
  selected,
  setSelected,
  onSimulationStarted,
}) {
  const [localStatus, setLocalStatus] = useState(latestStatus || 'IDLE');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (latestStatus) setLocalStatus(latestStatus);
  }, [latestStatus]);

  if (!simulatorUrl) return null;

  const dataset = DATASETS[selected];
  const running = starting || localStatus === 'SIMULATING';

  const startSimulation = async () => {
    if (running || !dataset) return;
    setStarting(true);
    try {
      onSimulationStarted?.(selected);
      const response = await fetch(`${simulatorUrl}/start-simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workload: dataset.data }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setLocalStatus('SIMULATING');
    } catch (error) {
      console.error('[LocalSimulator] failed to start', error);
      setLocalStatus('IDLE');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-4 shadow-console">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Local simulator</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Isolated from the cluster console. AKS leaves this hidden.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {localStatus}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          disabled={running}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
        >
          {Object.entries(DATASETS).map(([key, item]) => (
            <option key={key} value={key}>
              {item.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={startSimulation}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {starting ? 'Starting' : running ? 'Running' : 'Start simulation'}
        </button>
      </div>
      {dataset ? (
        <p className="mt-2 text-xs text-slate-500">
          {dataset.description}. {dataset.data.length} ticks. {simulatorUrl}
        </p>
      ) : null}
    </section>
  );
}
