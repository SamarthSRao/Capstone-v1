import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ComposedChart, Legend, BarChart, Bar, ReferenceLine
} from 'recharts';
import { 
  Cpu, Activity, Zap, ShieldCheck, TrendingUp, 
  Layers, Database, ArrowRight, Github, 
  Terminal, Globe, Shield, BarChart3, Info, Server,
  CheckCircle2, AlertCircle, RefreshCw, Clock, Box
} from 'lucide-react';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [sessionRequests, setSessionRequests] = useState(145820);
  const [isLive, setIsLive] = useState(false); // Toggle to real backend if found
  
  // MOCK DATA GENERATOR
  useEffect(() => {
    const generateMockPoint = (prevData) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      // Simulate a workload pattern (Sine wave + random spikes)
      const t = prevData.length;
      const baseLoad = 500 + Math.sin(t / 10) * 150;
      const noise = Math.random() * 40;
      const actual = Math.max(0, baseLoad + noise);
      
      // Predictor looks ahead and estimates uncertainty
      const predicted = baseLoad + Math.sin((t + 5) / 10) * 160 + (Math.random() * 20);
      const uncertainty = 30 + Math.random() * 20;
      
      // Orchestrator decision (Risk-averse scaling)
      const upper = predicted + uncertainty;
      const lower = predicted - uncertainty;
      
      // Step-based node scaling (each node handles ~60 RPS)
      const targetNodes = Math.ceil(upper / 55);
      const prevNodes = prevData.length > 0 ? prevData[prevData.length-1].nodes : 10;
      
      // Simulate cold start delay for scaling
      const nodes = targetNodes > prevNodes ? prevNodes + 0.1 : targetNodes;

      return {
        time: timeStr,
        actual: parseFloat(actual.toFixed(1)),
        predicted: parseFloat(predicted.toFixed(1)),
        upper: parseFloat(upper.toFixed(1)),
        lower: parseFloat(lower.toFixed(1)),
        nodes: Math.round(nodes * 10) / 10,
        latency: 140 + (actual / 100) + Math.random() * 10
      };
    };

    const interval = setInterval(() => {
      setData(prev => {
        const next = generateMockPoint(prev);
        setSessionRequests(s => s + Math.floor(next.actual));
        const newData = [...prev, next];
        return newData.slice(-40);
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // PDF-Specified Metrics (Mocked to match HybridTimeNet performance)
  const stats = useMemo(() => {
    const last = data[data.length - 1] || {};
    return [
      { label: 'SLA Reliability', val: '99.94%', sub: 'Target: 99.9%', color: 'text-emerald-400', icon: ShieldCheck },
      { label: 'Forecast MAPE', val: '3.18%', sub: 'Mean Abs % Error', color: 'text-blue-400', icon: BarChart3 },
      { label: 'Over-provisioning', val: '12.4%', sub: 'Resource Waste', color: 'text-amber-400', icon: Zap },
      { label: 'Active Fleet', val: `${Math.ceil(last.nodes || 10)} Nodes`, sub: 'Erlang-C Provisioned', color: 'text-white', icon: Server }
    ];
  }, [data]);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-300 font-mono selection:bg-blue-500/30">
      {/* PROMETHEUS TOP BAR */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center text-white font-black shadow-lg shadow-orange-900/20">
            H
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm tracking-tight">HybridTimeNet v1.0.4</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Cluster: htn-prod-simulator-01</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="flex items-center gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-500 uppercase font-black">Simulator Status</span>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-bold">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> OPERATIONAL
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[9px] text-slate-500 uppercase font-black">ML Inference</span>
                <span className="text-[11px] text-blue-400 flex items-center gap-1.5 font-bold">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> ACTIVE (MC_DROPOUT)
                </span>
              </div>
           </div>
           <div className="w-px h-8 bg-slate-800" />
           <div className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-[10px] flex items-center gap-3">
              <Clock size={12} className="text-slate-500" />
              <span className="text-slate-300 font-bold uppercase tracking-wider">Last 15m</span>
           </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto">
        {/* METRICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 p-5 rounded hover:border-slate-700 transition-colors group">
              <div className="flex justify-between items-start mb-3">
                 <div className="p-2 bg-slate-950 rounded text-slate-500 group-hover:text-blue-400 transition-colors">
                   <s.icon size={18} />
                 </div>
                 <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{s.label}</span>
              </div>
              <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.val}</div>
              <div className="text-[10px] text-slate-500 mt-1 font-bold">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* MAIN PANEL */}
        <div className="grid grid-cols-12 gap-6">
          {/* PRIMARY WORKLOAD CHART */}
          <div className="col-span-12 lg:col-span-8 bg-slate-900/50 border border-slate-800 rounded p-6">
            <div className="flex justify-between items-center mb-8">
               <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <Activity size={14} /> Workload Forecast & Provisioning
                  </h4>
                  <p className="text-[10px] text-slate-600">Requests per Second (RPS) vs. Bayesian Upper Bound</p>
               </div>
               <div className="flex gap-4 text-[9px] font-black uppercase">
                  <div className="flex items-center gap-2 text-slate-300"><div className="w-2 h-2 bg-white" /> Actual</div>
                  <div className="flex items-center gap-2 text-blue-400"><div className="w-2 h-0.5 border-t-2 border-blue-400 border-dashed" /> Forecast</div>
                  <div className="flex items-center gap-2 text-orange-500"><div className="w-2 h-2 bg-orange-500/20 border border-orange-500" /> Scale</div>
               </div>
            </div>

            <div className="h-[450px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data}>
                  <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#475569' }} hide={data.length < 5} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#475569' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }}
                    cursor={{ stroke: '#334155', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="#3b82f6" fillOpacity={0.05} baseValue="lower" />
                  <Line type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 4" dot={false} animationDuration={0} />
                  <Line type="stepAfter" dataKey="nodes" stroke="#ea580c" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual" stroke="#ffffff" strokeWidth={2} dot={{ r: 2, fill: '#ffffff' }} animationDuration={400} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SECONDARY PANELS */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            {/* LATENCY CHART */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded p-5">
              <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">P95 Latency (ms)</h4>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data}>
                    <CartesianGrid strokeDasharray="1 4" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#475569' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', fontSize: '10px' }} />
                    <Area type="monotone" dataKey="latency" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* RESOURCE DISTRIBUTION */}
            <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded p-5">
               <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Ensemble Confidence</h4>
               <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-[10px] mb-2 font-bold uppercase">
                       <span className="text-slate-400">Bayesian LSTM (Epistemic)</span>
                       <span className="text-blue-400">94.2%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                       <div className="bg-blue-500 h-full w-[94%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-2 font-bold uppercase">
                       <span className="text-slate-400">Neural Prophet (Trend)</span>
                       <span className="text-emerald-400">88.7%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                       <div className="bg-emerald-500 h-full w-[88%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-2 font-bold uppercase">
                       <span className="text-slate-400">XGBoost (Residuals)</span>
                       <span className="text-purple-400">91.4%</span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                       <div className="bg-purple-500 h-full w-[91%]" />
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* LOGS TERMINAL */}
        <div className="mt-6 bg-slate-950 border border-slate-800 rounded p-4 font-mono text-[10px] leading-relaxed">
           <div className="flex items-center gap-2 mb-3 border-b border-slate-900 pb-2">
              <Terminal size={12} className="text-slate-600" />
              <span className="text-slate-500 font-bold uppercase">Kernel Events</span>
           </div>
           <div className="space-y-1 overflow-y-auto max-h-[120px] custom-scrollbar">
              <div className="text-slate-600 font-bold">[{new Date().toISOString()}] <span className="text-blue-500">INFO</span>: HybridTimeNet Predictor warming up... (Window: 60s)</div>
              <div className="text-slate-600 font-bold">[{new Date().toISOString()}] <span className="text-emerald-500">INFO</span>: gRPC Handshake established with Predictor at :50051</div>
              <div className="text-slate-600 font-bold">[{new Date().toISOString()}] <span className="text-orange-500">WARN</span>: Variance spike detected. Switching to Risk-Averse provisioning.</div>
              <div className="text-slate-600 font-bold">[{new Date().toISOString()}] <span className="text-blue-500">INFO</span>: Provisioning 2 additional nodes (Cold Start initiated).</div>
              <div className="text-slate-600 font-bold">[{new Date().toISOString()}] <span className="text-slate-400 italic">... monitoring live trace ...</span></div>
           </div>
        </div>
      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #020617; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>
    </div>
  );
};

export default Dashboard;
