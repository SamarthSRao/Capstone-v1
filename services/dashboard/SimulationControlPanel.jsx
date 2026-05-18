import React from 'react';
import { Zap, TrendingUp, AlertTriangle, Leaf, RefreshCw, Play } from 'lucide-react';

const DATASETS = {
  Organic: {
    desc: 'Gradual organic traffic (200–400 RPS)',
    icon: Leaf,
    build: () => {
      const dataset = [];
      for (let i = 0; i < 120; i++) {
        dataset.push(200 + Math.floor(Math.random() * 200) + Math.floor(i * 0.5));
      }
      return dataset;
    },
  },
  'Flash Sale': {
    desc: 'Massive spike (2K+ RPS) at T+15s',
    icon: Zap,
    build: () => {
      const dataset = [];
      for (let i = 0; i < 120; i++) {
        let rps = 200;
        if (i > 15 && i < 45) rps = 2200 + Math.floor(Math.random() * 500);
        else if (i >= 45 && i < 80) rps = 1200 + Math.floor(Math.random() * 200);
        else rps = 300 + Math.floor(Math.random() * 100);
        dataset.push(rps);
      }
      return dataset;
    },
  },
  'Black Friday': {
    desc: 'Sustained high load growth',
    icon: TrendingUp,
    build: () => {
      const dataset = [];
      for (let i = 0; i < 120; i++) {
        let rps = 200;
        if (i > 10) rps = 1500 + Math.floor(Math.random() * 800) + i * 10;
        dataset.push(rps);
      }
      return dataset;
    },
  },
  'Bot Attack': {
    desc: 'Sudden micro-bursts of traffic',
    icon: AlertTriangle,
    build: () => {
      const dataset = [];
      for (let i = 0; i < 120; i++) {
        dataset.push(i % 10 === 0 ? 3000 : 200);
      }
      return dataset;
    },
  },
};

const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_URL || 'http://localhost:8083';

export const SimulationControlPanel = ({
  selectedDataset,
  onDatasetChange,
  simStatus,
  isSimulating,
  activeSimulation,
  onStart,
  onLog,
}) => {
  const selected = DATASETS[selectedDataset];
  const SelectedIcon = selected?.icon ?? Zap;

  const handleStart = async () => {
    if (!selected) return;
    const dataset = selected.build();
    onStart(selectedDataset);
    onLog(`Injecting ${selectedDataset} dataset (${dataset.length} ticks)`, 'success');

    try {
      const res = await fetch(`${SIMULATOR_URL}/start-simulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataset, workload: dataset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      onLog(`${selectedDataset} started — ${json.ticks ?? json.points ?? dataset.length} ticks queued`, 'info');
    } catch (err) {
      onLog(`Failed to start simulation: ${err.message}`, 'error');
    }
  };

  const statusColors = {
    IDLE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    SIMULATING: 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse',
    FINISHED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 h-full">
      <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2 uppercase tracking-widest">
        <Zap size={16} className="text-amber-400" /> Load Simulation
      </h4>
      <p className="text-xs text-slate-500 mb-4">
        Inject synthetic traffic into the E-Commerce Gateway to test the RL Agent.
      </p>

      <span
        className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border mb-4 ${
          statusColors[simStatus] ?? statusColors.IDLE
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-current" />
        {simStatus ?? 'IDLE'}
      </span>

      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
        Traffic Dataset
      </label>
      <select
        value={selectedDataset}
        onChange={(e) => onDatasetChange(e.target.value)}
        disabled={isSimulating}
        className="w-full mb-4 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white
                   focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
      >
        {Object.keys(DATASETS).map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <p className="text-[10px] text-slate-500 mb-4">{selected?.desc}</p>

      <button
        type="button"
        onClick={handleStart}
        disabled={isSimulating}
        className={`w-full py-4 rounded-xl border flex items-center justify-center gap-3 transition-all font-bold text-sm
          ${isSimulating
            ? 'border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed'
            : 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 hover:border-amber-500/60'
          }`}
      >
        {isSimulating ? (
          <RefreshCw size={18} className="animate-spin" />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
        {isSimulating ? `Running ${activeSimulation}…` : 'Simulate Load'}
      </button>

      <div className="mt-4 p-3 rounded-lg bg-black/30 border border-white/5 flex items-center gap-3">
        <SelectedIcon size={16} className="text-slate-400 shrink-0" />
        <div>
          <div className="text-xs font-bold text-slate-300">{selectedDataset}</div>
          <div className="text-[10px] text-slate-500">{selected?.desc}</div>
        </div>
      </div>
    </div>
  );
};
