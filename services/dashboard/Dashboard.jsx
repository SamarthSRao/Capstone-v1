import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Zap, 
  TrendingUp,
  Cpu,
  Database,
  Layers,
  BarChart3,
  AlertCircle
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  ComposedChart
} from 'recharts';

const HybridTimeNetDashboard = () => {
  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState({
    slaViolationRate: 0.02,
    overprovisioningRatio: 1.15,
    activeServers: 12,
    p95Latency: 142,
    modelConfidence: 0.94
  });

  // Simulate real-time data flow from the Orchestrator and Predictor
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const baseLoad = 4000 + Math.sin(now.getTime() / 10000) * 1000 + Math.random() * 500;
      const std = 200 + Math.random() * 300;
      
      const newPoint = {
        time: now.toLocaleTimeString(),
        actual: baseLoad + (Math.random() - 0.5) * 400,
        mean: baseLoad,
        upper: baseLoad + 2 * std,
        lower: Math.max(0, baseLoad - 2 * std),
        servers: Math.ceil((baseLoad + 2 * std) / 500) // Mock scaling logic
      };
      
      setData(prev => [...prev.slice(-40), newPoint]);
      
      // Randomly update metrics
      setMetrics(prev => ({
        ...prev,
        activeServers: newPoint.servers,
        slaViolationRate: Math.max(0, prev.slaViolationRate + (Math.random() - 0.5) * 0.005),
        p95Latency: 100 + Math.random() * 80
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#D1D1D1] font-sans p-6 selection:bg-[#6366f1] selection:text-white">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Layers className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">HybridTimeNet</h1>
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Uncertainty-Aware Cloud Autoscaler</p>
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">System Status</span>
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ORCHESTRATOR ACTIVE
            </span>
          </div>
          <div className="h-8 w-px bg-white/10 mx-2" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Model Mode</span>
            <span className="text-xs font-bold text-indigo-400">BAYESIAN_MC_DROPOUT</span>
          </div>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        {[
          { label: 'Active Servers', val: metrics.activeServers, icon: Cpu, color: 'text-white' },
          { label: 'SLA Violation Rate', val: `${(metrics.slaViolationRate * 100).toFixed(2)}%`, icon: ShieldCheck, color: 'text-emerald-400' },
          { label: 'P95 Latency', val: `${metrics.p95Latency.toFixed(0)}ms`, icon: Zap, color: 'text-amber-400' },
          { label: 'Overprovisioning', val: `${metrics.overprovisioningRatio.toFixed(2)}x`, icon: BarChart3, color: 'text-indigo-400' },
          { label: 'Epistemic Risk', val: 'LOW', icon: AlertCircle, color: 'text-emerald-400' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.05] transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-white/5 rounded-lg">
                <kpi.icon size={18} className="text-white/60" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-1">{kpi.label}</span>
              <span className={`text-2xl font-bold tracking-tight ${kpi.color}`}>{kpi.val}</span>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN VISUALIZATION */}
      <div className="grid grid-cols-12 gap-8">
        
        {/* WORKLOAD FORECAST CHART */}
        <div className="col-span-12 lg:col-span-8 bg-white/[0.03] border border-white/5 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-bold text-white">Workload Prediction & Uncertainty Bands</h3>
              <p className="text-sm text-white/40">Real-time inference vs Bayesian confidence intervals</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-500/20 border border-indigo-500" />
                <span className="text-xs font-bold text-white/60 uppercase">95% CI Band</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-white" />
                <span className="text-xs font-bold text-white/60 uppercase">Actual</span>
              </div>
            </div>
          </div>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <defs>
                  <linearGradient id="colorUncertainty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#141416', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="upper" 
                  stroke="none" 
                  fill="#6366f1" 
                  fillOpacity={0.1} 
                  baseValue="lower"
                />
                <Line type="monotone" dataKey="mean" stroke="#6366f1" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="actual" stroke="#fff" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SIDEBAR: MODEL INSIGHTS */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Database size={16} className="text-indigo-400" /> Ensemble Weights
            </h3>
            <div className="space-y-6">
              {[
                { name: 'Bayesian LSTM', weight: 0.65, label: 'Temporal Trends' },
                { name: 'Neural Prophet', weight: 0.25, label: 'Seasonality' },
                { name: 'XGBoost', weight: 0.10, label: 'Residual Correction' },
              ].map((m, i) => (
                <div key={i}>
                  <div className="flex justify-between items-end mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{m.name}</span>
                      <span className="text-[10px] text-white/30 uppercase">{m.label}</span>
                    </div>
                    <span className="text-xs font-mono text-indigo-400">{(m.weight * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${m.weight * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-6">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-400" /> Provisioning Logic
            </h3>
            <p className="text-xs text-white/50 leading-relaxed mb-4">
              System currently provisioning for <span className="text-white font-bold">P95 (Mean + 2σ)</span> to minimize SLA violations during high epistemic uncertainty periods.
            </p>
            <div className="bg-black/20 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center text-[10px] font-mono mb-2">
                <span className="text-white/40">Target Intensity (ρ)</span>
                <span className="text-emerald-400">0.82</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-white/40">Erlang-C Wait Prob</span>
                <span className="text-emerald-400">0.008</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HybridTimeNetDashboard;
