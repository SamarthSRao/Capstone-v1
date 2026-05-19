import React, { useState, useEffect, useRef } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart,
} from 'recharts';
import {
  Activity, Zap, ShieldCheck, Server, Terminal,
  Clock, Box,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SimulationControlPanel } from './SimulationControlPanel';

const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_URL || 'http://localhost:8083';

const Dashboard = () => {
  const [chartData, setChartData] = useState([]);
  const [connected, setConnected] = useState(false);
  const [simStatus, setSimStatus] = useState('IDLE');
  const [selectedDataset, setSelectedDataset] = useState('Flash Sale');
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSimulation, setActiveSimulation] = useState(null);
  const [logs, setLogs] = useState([]);
  const lastHighLoadLog = useRef(0);

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
    setLogs((prev) => [...prev.slice(-49), { timestamp, msg, type }]);
  };

  useEffect(() => {
    addLog('HybridTimeNet Agent Connected to Commerce Gateway', 'info');
    addLog('Monitoring API Endpoints: /checkout, /cart, /catalog', 'info');
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${SIMULATOR_URL}/metrics`);
        if (!response.ok) {
          setConnected(false);
          return;
        }

        const data = await response.json();
        setConnected(true);
        setSimStatus(data.status ?? 'IDLE');

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        const newPoint = {
          time: timeStr,
          actualRPS: data.current_rps ?? 0,
          activeServers: data.active_servers ?? 2,
          violations: data.violations ?? 0,
          slaReliability: data.sla_reliability ?? 100,
          status: data.status ?? 'IDLE',
          predictedMean: data.predicted_mean?.length
            ? Math.max(...data.predicted_mean)
            : null,
          predictedUpper: data.predicted_upper?.length
            ? Math.max(...data.predicted_upper)
            : null,
          predictedLower: data.predicted_lower?.length
            ? Math.min(...data.predicted_lower)
            : null,
          requiredServers: data.required_servers ?? null,
          latency: data.current_rps > 0
            ? 120 + data.current_rps / 50
            : 100,
        };

        setChartData((prev) => [...prev, newPoint].slice(-60));

        if (data.status === 'FINISHED' && isSimulating) {
          setIsSimulating(false);
          setActiveSimulation(null);
          addLog('Simulation finished — returning to idle baseline', 'info');
        }

        if (data.current_rps > 1000 && data.status === 'SIMULATING') {
          const bucket = Math.floor(data.current_rps / 500);
          if (bucket !== lastHighLoadLog.current) {
            lastHighLoadLog.current = bucket;
            addLog(`High traffic: ${data.current_rps} RPS — RL Agent scaling`, 'warn');
          }
        }
      } catch {
        setConnected(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimulating]);

  const handleSimulationStart = (datasetName) => {
    setIsSimulating(true);
    setActiveSimulation(datasetName);
  };

  const latest = chartData[chartData.length - 1];

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-blue-500/30">
      <div className="fixed top-0 left-[20%] w-[60%] h-[300px] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[400px] bg-emerald-600/10 rounded-full blur-[150px] pointer-events-none" />

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

        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 text-xs px-3 py-1 rounded-full ${
              connected
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400 animate-pulse'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Disconnected — start docker compose up'}
          </div>

          <div className="hidden md:flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Target Environment</span>
              <span className="text-xs text-white font-medium flex items-center gap-1.5">
                <Box size={12} className="text-slate-400" /> NexusGear Storefront
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">RL Predictor</span>
              <span className={`text-xs flex items-center gap-1.5 font-bold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                {connected ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1800px] mx-auto relative z-10 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Gateway RPS', val: `${Math.round(latest?.actualRPS ?? 0).toLocaleString()}`, sub: 'Requests/sec', icon: Activity, color: 'text-white' },
            { label: 'Predicted Upper', val: latest?.predictedUpper != null ? Math.round(latest.predictedUpper).toLocaleString() : '—', sub: 'Erlang-C input', icon: Zap, color: 'text-amber-400' },
            { label: 'Active Fleet', val: `${Math.ceil(latest?.activeServers ?? 1)}`, sub: 'Provisioned Nodes', icon: Server, color: 'text-amber-400' },
            { label: 'Required Servers', val: latest?.requiredServers != null ? String(latest.requiredServers) : '—', sub: 'RL recommendation', icon: Server, color: 'text-emerald-400' },
            { label: 'SLA Reliability', val: `${(latest?.slaReliability ?? 100).toFixed(1)}%`, sub: `${latest?.violations ?? 0} Violations`, icon: ShieldCheck, color: (latest?.slaReliability ?? 100) > 99 ? 'text-emerald-400' : 'text-red-400' },
          ].map((s, i) => (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={s.label}
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
          <div className="lg:col-span-3 bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h4 className="text-lg font-bold text-white">E-Commerce Traffic Telemetry</h4>
                <p className="text-sm text-slate-500">Live request volume vs. RL prediction boundaries</p>
              </div>
              <div className="flex flex-wrap gap-4 text-xs font-bold uppercase tracking-wider">
                <div className="flex items-center gap-2 text-white"><div className="w-2.5 h-2.5 rounded-full bg-white" /> Actual RPS</div>
                <div className="flex items-center gap-2 text-blue-500"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Predicted Mean</div>
                <div className="flex items-center gap-2 text-amber-500"><div className="w-6 h-0.5 bg-amber-500" /> Upper Bound</div>
                <div className="flex items-center gap-2 text-amber-400"><div className="w-2.5 h-2.5 bg-amber-400" /> Servers</div>
              </div>
            </div>

            <div className="h-[400px] w-full">
              {!connected && chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                  Waiting for simulator at {SIMULATOR_URL}/metrics…
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" vertical={false} />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={30} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                      itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}
                      cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 4' }}
                    />
                    <Area
                      dataKey="predictedUpper"
                      fill="#3b82f615"
                      stroke="none"
                      name="Uncertainty Band"
                      legendType="none"
                      connectNulls={false}
                    />
                    <Area
                      dataKey="predictedLower"
                      fill="#050505"
                      stroke="none"
                      legendType="none"
                      connectNulls={false}
                    />
                    <Line
                      dataKey="predictedMean"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      name="Predicted Mean"
                      connectNulls={false}
                    />
                    <Line
                      dataKey="predictedUpper"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      dot={false}
                      name="Upper Bound (Erlang-C input)"
                      connectNulls={false}
                    />
                    <Line type="stepAfter" dataKey="activeServers" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} name="Active Servers" />
                    <Line type="monotone" dataKey="actualRPS" stroke="#ffffff" strokeWidth={2} dot={false} isAnimationActive={false} name="Actual RPS" />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {latest && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
                {[
                  { label: 'Actual RPS', value: latest.actualRPS, color: '#ef4444' },
                  { label: 'Predicted Upper', value: latest.predictedUpper != null ? latest.predictedUpper.toFixed(0) : '—', color: '#f59e0b' },
                  { label: 'Required Servers', value: latest.requiredServers ?? '—', color: '#22c55e' },
                  { label: 'SLA Reliability', value: `${latest.slaReliability?.toFixed(1) ?? '—'}%`, color: latest.slaReliability > 99 ? '#22c55e' : '#ef4444' },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid #252525',
                      borderRadius: 8,
                      padding: 16,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 12, color: '#71717A', marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <SimulationControlPanel
              selectedDataset={selectedDataset}
              onDatasetChange={setSelectedDataset}
              simStatus={simStatus}
              isSimulating={isSimulating}
              activeSimulation={activeSimulation}
              onStart={handleSimulationStart}
              onLog={addLog}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
            <h4 className="text-sm font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
              <Clock size={16} className="text-emerald-400" /> Gateway P95 Latency
            </h4>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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

          <div className="lg:col-span-2 bg-black border border-white/5 rounded-2xl p-6 font-mono relative overflow-hidden flex flex-col">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-purple-500" />
            <h4 className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest flex items-center gap-2">
              <Terminal size={14} /> Agent / Gateway Event Stream
            </h4>
            <div className="flex-1 overflow-y-auto space-y-2 text-xs custom-scrollbar max-h-[200px]">
              <AnimatePresence>
                {logs.map((log, i) => (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={`${log.timestamp}-${i}`}
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

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
    </div>
  );
};

export default Dashboard;
