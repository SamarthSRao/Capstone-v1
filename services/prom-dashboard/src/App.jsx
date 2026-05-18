import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend 
} from 'recharts';
import { Search, Plus, X, Play, Clock, ChevronDown, Monitor, Database, Activity, HelpCircle } from 'lucide-react';

const App = () => {
  const [query, setQuery] = useState('hybridtimenet_workload_rps{model="bayesian_lstm"}');
  const [data, setData] = useState([]);
  const [activeTab, setActiveTab] = useState('Graph');
  const [timeRange, setTimeRange] = useState('1h');

  // MOCK DATA GENERATOR
  useEffect(() => {
    const generateData = () => {
      const now = Math.floor(Date.now() / 1000);
      const points = [];
      for (let i = 50; i >= 0; i--) {
        const t = now - (i * 2);
        const base = 400 + Math.sin(t / 100) * 100;
        points.push({
          timestamp: t,
          time: new Date(t * 1000).toLocaleTimeString([], { hour12: false }),
          value: base + Math.random() * 20,
          predicted: base + 10 + Math.random() * 10,
          upper: base + 40 + Math.random() * 5,
        });
      }
      setData(points);
    };

    generateData();
    const interval = setInterval(() => {
      setData(prev => {
        const last = prev[prev.length - 1];
        const t = last.timestamp + 2;
        const base = 400 + Math.sin(t / 100) * 100;
        const next = {
          timestamp: t,
          time: new Date(t * 1000).toLocaleTimeString([], { hour12: false }),
          value: base + Math.random() * 20,
          predicted: base + 10 + Math.random() * 10,
          upper: base + 40 + Math.random() * 5,
        };
        return [...prev.slice(1), next];
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* CLASSIC PROMETHEUS NAVBAR */}
      <nav className="bg-[#f8f9fa] border-b border-[#dee2e6] px-4 py-1 flex items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-6 h-6 bg-[#e6522c] rounded flex items-center justify-center text-white font-bold text-xs">P</div>
          <span className="font-bold text-lg">Prometheus</span>
        </div>
        
        <div className="flex items-center gap-1">
          <button className="prom-nav-link">Alerts</button>
          <button className="prom-nav-link active">Graph</button>
          <div className="relative group">
             <button className="prom-nav-link flex items-center gap-1">Status <ChevronDown size={14} /></button>
          </div>
          <button className="prom-nav-link">Help</button>
        </div>
      </nav>

      {/* QUERY AREA */}
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-4">
           <div className="flex-1 relative">
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border border-[#ced4da] rounded py-1.5 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#e6522c]/50"
              />
           </div>
           <button className="bg-[#e6522c] text-white px-4 py-1.5 rounded font-bold hover:bg-[#d44521] transition-colors flex items-center gap-2">
             <Play size={14} fill="currentColor" /> Execute
           </button>
        </div>

        {/* TAB CONTROL */}
        <div className="border border-[#dee2e6] rounded">
          <div className="bg-[#f8f9fa] border-b border-[#dee2e6] px-4 py-2 flex items-center justify-between">
            <div className="flex gap-4">
              <button 
                onClick={() => setActiveTab('Graph')}
                className={`text-sm font-bold pb-2 border-b-2 transition-all ${activeTab === 'Graph' ? 'border-[#e6522c] text-[#e6522c]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Graph
              </button>
              <button 
                onClick={() => setActiveTab('Table')}
                className={`text-sm font-bold pb-2 border-b-2 transition-all ${activeTab === 'Table' ? 'border-[#e6522c] text-[#e6522c]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Table
              </button>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <Clock size={14} /> {timeRange} <ChevronDown size={12} />
               </div>
               <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  Res: auto <ChevronDown size={12} />
               </div>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'Graph' ? (
              <div className="h-[450px] w-full bg-white relative">
                 {/* GRID LINES EMULATION */}
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                       <CartesianGrid stroke="#eee" vertical={true} />
                       <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={10} axisLine={{ stroke: '#999' }} />
                       <YAxis tick={{ fontSize: 11 }} axisLine={{ stroke: '#999' }} />
                       <Tooltip 
                         contentStyle={{ backgroundColor: 'rgba(255,255,255,0.95)', border: '1px solid #ccc', fontSize: '12px' }}
                       />
                       <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                       <Line 
                         type="monotone" 
                         dataKey="value" 
                         name="hybridtimenet_workload_rps{model='actual'}" 
                         stroke="#2563eb" 
                         strokeWidth={2} 
                         dot={false}
                         animationDuration={0}
                       />
                       <Line 
                         type="monotone" 
                         dataKey="predicted" 
                         name="hybridtimenet_workload_rps{model='bayesian_lstm'}" 
                         stroke="#e6522c" 
                         strokeWidth={2} 
                         dot={false}
                         animationDuration={0}
                       />
                       <Line 
                         type="monotone" 
                         dataKey="upper" 
                         name="hybridtimenet_uncertainty_upper_bound" 
                         stroke="#10b981" 
                         strokeWidth={1} 
                         strokeDasharray="4 4"
                         dot={false}
                         animationDuration={0}
                       />
                    </LineChart>
                 </ResponsiveContainer>
              </div>
            ) : (
              <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm">
                    <thead className="bg-[#f8f9fa] border-b border-[#dee2e6]">
                       <tr>
                          <th className="px-4 py-2 font-bold">Element</th>
                          <th className="px-4 py-2 font-bold">Value</th>
                       </tr>
                    </thead>
                    <tbody>
                       <tr className="border-b border-[#eee]">
                          <td className="px-4 py-3 font-mono text-xs text-[#e6522c]">hybridtimenet_workload_rps&#123;model="bayesian_lstm"&#125;</td>
                          <td className="px-4 py-3 font-mono">{(data[data.length-1]?.predicted || 0).toFixed(3)}</td>
                       </tr>
                       <tr className="border-b border-[#eee]">
                          <td className="px-4 py-3 font-mono text-xs text-[#2563eb]">hybridtimenet_workload_rps&#123;model="actual"&#125;</td>
                          <td className="px-4 py-3 font-mono">{(data[data.length-1]?.value || 0).toFixed(3)}</td>
                       </tr>
                       <tr className="border-b border-[#eee]">
                          <td className="px-4 py-3 font-mono text-xs text-[#10b981]">hybridtimenet_uncertainty_upper_bound</td>
                          <td className="px-4 py-3 font-mono">{(data[data.length-1]?.upper || 0).toFixed(3)}</td>
                       </tr>
                    </tbody>
                 </table>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM METADATA */}
        <div className="mt-6 bg-[#f8f9fa] border border-[#dee2e6] rounded p-4 flex gap-8">
           <div className="flex items-center gap-2">
              <Database size={16} className="text-slate-400" />
              <div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase">TSDB Status</div>
                 <div className="text-xs font-bold text-emerald-600">HEAD BLOCK WRITABLE</div>
              </div>
           </div>
           <div className="flex items-center gap-2">
              <Monitor size={16} className="text-slate-400" />
              <div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase">Simulator API</div>
                 <div className="text-xs font-bold text-blue-600">v1.2.0-HTN</div>
              </div>
           </div>
           <div className="flex items-center gap-2">
              <Activity size={16} className="text-slate-400" />
              <div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase">Scrape Interval</div>
                 <div className="text-xs font-bold">2.000s</div>
              </div>
           </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-[#dee2e6] p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-4">
         <span>Prometheus v2.51.0 (HybridTimeNet Extension)</span>
         <span className="w-1 h-1 bg-slate-300 rounded-full" />
         <a href="#" className="text-blue-500 hover:underline">Documentation</a>
         <a href="#" className="text-blue-500 hover:underline">GitHub</a>
      </footer>
    </div>
  );
};

export default App;
