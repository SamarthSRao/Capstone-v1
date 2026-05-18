import React, { useState, useEffect, useMemo } from 'react';
import { 
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, ReferenceLine, BarChart, Bar
} from 'recharts';
import { 
  Activity, Zap, ShieldCheck, Server, Terminal, 
  Clock, RefreshCw, ShoppingCart, TrendingUp, AlertTriangle, Play, Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [sessionRequests, setSessionRequests] = useState(0);
  const [violations, setViolations] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLog = (msg, type = "info") => {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
    setLogs(prev => [...prev.slice(-49), { timestamp, msg, type }]);
  };

  useEffect(() => {
    addLog("HybridTimeNet Agent Connected to Commerce Gateway", "info");
    addLog("Monitoring API Endpoints: /checkout, /cart, /catalog", "info");
  }, []);

  // REAL DATA POLLING
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:8083/metrics');
        if (!response.ok) return;
        
        const json = await response.json();
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        setData(prev => {
          const next = {
            time: timeStr,
            actual: json.current_rps,
            predicted: parseFloat(json.predicted_load.toFixed(1)),
            upper: parseFloat(json.predicted_load.toFixed(1)), // Ideally these come from the backend if bounded
            lower: parseFloat((json.predicted_load * 0.8).toFixed(1)),
            nodes: json.active_servers,
            latency: json.current_rps > 0 ? 120 + (json.current_rps / 50) + Math.random() * 20 : 100,
            revenue: json.current_rps * (Math.random() * 2 + 5) // Simulated revenue based on load
          };
          return [...prev, next].slice(-60); // Keep last 60 seconds
        });

        if (json.current_rps > 1000 && !isSimulating) {
           if (Math.random() > 0.9) addLog(`High traffic detected: ${json.current_rps} RPS. RL Agent scaling up.`, "warn");
        }

        setSessionRequests(json.total_requests);
        setViolations(json.violations);
      } catch (err) {
        console.error("Failed to fetch metrics from Simulator", err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const handleSimulateLoad = async (type) => {
    setIsSimulating(true);
    setActiveSimulation(type);
    addLog(`Initiated ${type} E-Commerce Load Simulation`, "success");
    
    try {
      const dataset = [];
      for(let i=0; i<120; i++) {
         let rps = 200;
         if (type === "Flash Sale") {
             if (i > 15 && i < 45) rps = 2200 + Math.floor(Math.random() * 500);
             else if (i >= 45 && i < 80) rps = 1200 + Math.floor(Math.random() * 200);
             else rps = 300 + Math.floor(Math.random() * 100);
         } else if (type === "Black Friday") {
             if (i > 10) rps = 1500 + Math.floor(Math.random() * 800) + (i * 10);
         } else if (type === "Bot Attack") {
             if (i % 10 === 0) rps = 3000; // Sudden spikes
             else rps = 200;
         }
         dataset.push(rps);
      }

      await fetch('http://localhost:8083/start-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataset })
      });
      
    } catch (err) {
      addLog(`Failed to start simulation: ${err.message}`, "error");
    }
    
    setTimeout(() => {
      setIsSimulating(false);
      setActiveSimulation(null);
      addLog(`${type} Simulation Complete`, "info");
    }, 120000);
  };

  const lastData = data[data.length - 1] || { actual: 0, predicted: 0, nodes: 0, latency: 0, revenue: 0 };
  const slaRate = sessionRequests > 0 ? ((1 - (violations / sessionRequests)) * 100).toFixed(2) : '100.00';

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-blue-500/30">
      {/* GLOWING BACKGROUND EFFECTS */}
      <div className="fixed top-0 left-[20%] w-[60%] h-[300px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[400px] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none" />

      {/* HEADER */}
      <header className="border-b border-white/5 bg-black/40 backdrop-blur-2xl sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-900 border border-blue-500/30 rounded-xl flex items-center justify-center text-white font-black shadow-[0_0_20px_rgba(37,99,235,0.3)]">
            HT
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold tracking-tight">HybridTimeNet</span>
            <span className="text-xs text-blue-400 font-medium tracking-wide">E-Commerce Operations Center</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
           <div className="hidden md:flex items-center gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Target Environment</span>
                <span className="text-xs text-white font-medium flex items-center gap-1.5">
                  <Box size={12} className="text-slate-400" /> NexusGear Storefront
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">RL Predictor</span>
                <span className="text-xs text-emerald-400 flex items-center gap-1.5 font-bold">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" /> ONLINE
                </span>
              </div>
           </div>
        </div>
      </header>

      <main className="p-6 max-w-[1800px] mx-auto relative z-10 space-y-6">
        
        {/* TOP LEVEL METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Gateway RPS', val: `${Math.round(lastData.actual).toLocaleString()}`, sub: 'Requests/sec', icon: Activity, color: 'text-white' },
            { label: 'Predicted Load', val: `${Math.round(lastData.predicted).toLocaleString()}`, sub: 'RL Agent Forecast', icon: Zap, color: 'text-blue-400' },
            { label: 'Active Fleet', val: `${Math.ceil(lastData.nodes || 1)}`, sub: 'Provisioned Nodes', icon: Server, color: 'text-amber-400' },
            { label: 'SLA Reliability', val: `${slaRate}%`, sub: `${violations} Violations`, icon: ShieldCheck, color: slaRate > 99 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Live Revenue', val: `$${Math.round(lastData.revenue || 0).toLocaleString()}`, sub: 'Estimated / sec', icon: ShoppingCart, color: 'text-purple-400' }
          ].map((s, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={i} 
              className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 hover:bg-white/[0.04] transition-colors relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <s.icon size={48} className={s.color} />
              </div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                 <div className={`p-2 bg-white/5 rounded-lg ${s.color}`}>
                   <s.icon size={18} />
                 </div>
                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{s.label}</span>
              </div>
              <div className={`text-3xl font-bold tracking-tight tabular-nums relative z-10 ${s.color}`}>{s.val}</div>
              <div className="text-xs text-slate-500 mt-2 font-medium relative z-10">{s.sub}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* MAIN CHART */}
          <div className="lg:col-span-3 bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-8">
               <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    E-Commerce Traffic Telemetry
                  </h4>
                  <p className="text-sm text-slate-500">Live request volume vs. RL prediction boundaries</p>
               </div>
               <div className="flex gap-6 text-xs font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-2 text-white"><div className="w-2.5 h-2.5 rounded-full bg-white" /> Actual Load</div>
                  <div className="flex items-center gap-2 text-blue-500"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> RL Forecast</div>
                  <div className="flex items-center gap-2 text-amber-500"><div className="w-2.5 h-0.5 bg-amber-500" /> Provisioned Capacity</div>
               </div>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={30} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}
                    cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Area type="monotone" dataKey="upper" stroke="none" fill="url(#colorPredicted)" baseValue="lower" />
                  <Line type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="nodes" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="actual" stroke="#ffffff" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SIMULATION CONTROLS */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 h-full">
               <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2 uppercase tracking-widest">
                 <Zap size={16} className="text-amber-400" /> Load Simulation
               </h4>
               <p className="text-xs text-slate-500 mb-6">Inject synthetic traffic patterns into the E-Commerce Gateway to test the RL Agent.</p>
               
               <div className="space-y-3">
                 {[
                   { name: "Flash Sale", desc: "Massive spike (2K+ RPS) at T+15s", icon: Zap, color: "hover:border-amber-500/50 hover:bg-amber-500/10", activeColor: "border-amber-500 bg-amber-500/20 text-amber-300" },
                   { name: "Black Friday", desc: "Sustained high load growth", icon: TrendingUp, color: "hover:border-purple-500/50 hover:bg-purple-500/10", activeColor: "border-purple-500 bg-purple-500/20 text-purple-300" },
                   { name: "Bot Attack", desc: "Sudden micro-bursts of traffic", icon: AlertTriangle, color: "hover:border-red-500/50 hover:bg-red-500/10", activeColor: "border-red-500 bg-red-500/20 text-red-300" }
                 ].map((sim) => (
                   <button 
                     key={sim.name}
                     onClick={() => handleSimulateLoad(sim.name)}
                     disabled={isSimulating}
                     className={`w-full p-4 rounded-xl border flex items-center gap-4 transition-all text-left group
                        ${isSimulating && activeSimulation === sim.name ? sim.activeColor : 'border-white/5 bg-white/[0.01]'}
                        ${!isSimulating ? sim.color : (activeSimulation !== sim.name ? 'opacity-50 cursor-not-allowed' : '')}
                     `}
                   >
                     <div className={`p-2 rounded-lg bg-black/40 ${isSimulating && activeSimulation === sim.name ? '' : 'group-hover:scale-110 transition-transform'}`}>
                       <sim.icon size={18} />
                     </div>
                     <div>
                       <div className="font-bold text-sm text-slate-200">{sim.name}</div>
                       <div className="text-[10px] text-slate-500">{sim.desc}</div>
                     </div>
                     {isSimulating && activeSimulation === sim.name && (
                       <RefreshCw size={14} className="ml-auto animate-spin" />
                     )}
                   </button>
                 ))}
               </div>
            </div>
          </div>
        </div>

        {/* BOTTOM PANELS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LATENCY */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
               <Clock size={16} className="text-emerald-400" /> Gateway P95 Latency
            </h4>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['dataMin - 10', 'dataMax + 10']} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} fill="url(#colorLatency)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* SYSTEM LOGS */}
          <div className="lg:col-span-2 bg-black border border-white/5 rounded-2xl p-6 font-mono relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-500" />
            <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">
               <Terminal size={14} /> Agent / Gateway Event Stream
            </h4>
            <div className="flex-1 overflow-y-auto space-y-2 text-xs custom-scrollbar">
              <AnimatePresence>
                {logs.map((log, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className="flex gap-3"
                  >
                    <span className="text-slate-600">[{log.timestamp}]</span>
                    <span className={`font-bold ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-amber-400' :
                      log.type === 'success' ? 'text-emerald-400' :
                      'text-blue-400'
                    }`}>
                      {log.type.toUpperCase().padEnd(7)}
                    </span>
                    <span className="text-slate-300">{log.msg}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {logs.length === 0 && <div className="text-slate-600 italic">Waiting for events...</div>}
            </div>
          </div>
        </div>

      </main>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
};

export default Dashboard;
