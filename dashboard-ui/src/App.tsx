import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Terminal, RefreshCcw, Cpu
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tipado para los datos que recibiremos del WebSocket
interface Trade {
  id: string;
  symbol: string;
  pnl: number;
  status: string;
}

export default function App() {
  const [capital, setCapital] = useState<string>("0.000000");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // Conexión al WebSocket local (Antigravity Engine)
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      setLogs((prev) => ['[Sistema] 🟢 WebSocket Conectado al Dashboard Antigravity', ...prev]);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.capital) setCapital(data.capital);
        if (data.trades) setTrades(data.trades);
        if (data.stats) setStats(data.stats);
        if (data.log) {
          setLogs((prev) => [data.log, ...prev].slice(0, 50)); 
        }
      } catch (err) {
        console.error("Error parseando datos del WS", err);
      }
    };

    ws.onclose = () => {
      setLogs((prev) => ['[Sistema] 🔴 Desconectado del servidor. Reconectando...', ...prev]);
    };

    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen bg-background text-slate-200 p-4 md:p-8 font-mono bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-background to-black selection:bg-primary/30 antialiased overflow-x-hidden">
      
      {/* Header aligned with user's specific request */}
      <header className="max-w-7xl mx-auto mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600 drop-shadow-[0_0_15px_rgba(0,136,255,0.4)]">
          SLAVI TERMINAL
        </h1>
        <div className="flex items-center justify-center gap-2 mt-2">
            <Cpu className="w-3 h-3 text-secondary animate-pulse" />
            <p className="text-slate-500 text-xs tracking-widest uppercase">V2.0 ANTIGRAVITY ENGINE</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* SECCIÓN 1: Capital BNB (Tarjeta flotante mejorada) */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-1 glass-card p-10 flex flex-col justify-center items-center group relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Wallet className="w-20 h-20 text-white" />
                </div>
                <h2 className="text-slate-400 text-xs uppercase tracking-[0.3em] mb-6 font-bold">Capital Activo (BNB)</h2>
                <div className="text-6xl font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.3)] tabular-nums">
                    {capital}
                </div>
                <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-secondary/10 rounded-full border border-secondary/20 glow-secondary">
                    <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-tighter">Monitor de Tesorería Activo</span>
                </div>
            </motion.div>

            {/* SECCIÓN 2: Mercado en Tiempo Real (+ Advanced Chart) */}
            <div className="lg:col-span-2 space-y-6">
                <div className="glass-card p-8 h-full min-h-[300px]">
                    <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                        <h2 className="text-slate-400 text-xs uppercase tracking-[0.2em] font-bold">Mercado en Tiempo Real</h2>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-500 uppercase">ROI</span>
                                <span className={cn("text-sm font-bold", parseFloat(stats?.tradeStats?.profitPercent || '0') >= 0 ? "text-secondary" : "text-accent")}>
                                    {stats?.tradeStats?.profitPercent || '0.00'}%
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                        <AnimatePresence mode="popLayout">
                        {trades.length === 0 ? (
                            <div className="text-center text-slate-500 py-12 animate-pulse flex flex-col items-center gap-4">
                                <RefreshCcw className="w-8 h-8 opacity-20" />
                                <p className="text-xs uppercase tracking-widest font-mono">Escaneando oportunidades de mercado...</p>
                            </div>
                        ) : (
                            trades.map((trade) => (
                                <motion.div 
                                    key={trade.symbol} 
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex justify-between items-center bg-black/40 border border-white/5 rounded-2xl p-5 hover:bg-black/60 transition-colors"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className="relative">
                                            <div className="w-2.5 h-2.5 rounded-full bg-primary glow-primary"></div>
                                            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-primary animate-ping"></div>
                                        </div>
                                        <div>
                                            <span className="text-2xl font-black tracking-tight">{trade.symbol}</span>
                                            <span className="ml-3 text-[10px] px-2 py-0.5 bg-slate-800 rounded-lg text-slate-400 font-bold border border-white/5 uppercase">
                                                {trade.status}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={cn("text-3xl font-black tabular-nums drop-shadow-md", 
                                        trade.pnl >= 0 ? 'text-secondary' : 'text-accent'
                                    )}>
                                        {trade.pnl > 0 ? '+' : ''}{trade.pnl.toFixed(2)}%
                                    </div>
                                </motion.div>
                            ))
                        )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 3: Terminal de Logs (Fondo oscuro profundo) */}
            <div className="lg:col-span-3 glass-card bg-black/80 p-6 shadow-inner">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-slate-500 tracking-[0.2em]">SLAVI.PRODUCTION.TERMINAL</span>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-accent/40"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-secondary/40"></div>
                    </div>
                </div>
                <div className="h-64 overflow-y-auto space-y-1.5 font-mono text-[11px] custom-scrollbar selection:bg-secondary/20">
                    {logs.map((log, index) => (
                        <div key={index} className={cn(
                            "flex gap-3 hover:bg-white/5 px-2 py-0.5 rounded transition-colors group",
                            log.includes('Error') || log.includes('🔴') || log.includes('FAILED') ? 'text-accent' : 
                            log.includes('✅') || log.includes('🚀') || log.includes('SUCCESS') ? 'text-secondary' : 
                            'text-slate-400'
                        )}>
                            <span className="text-slate-600 font-bold opacity-50 group-hover:opacity-100 flex-shrink-0 transition-opacity">
                                [{new Date().toLocaleTimeString([], { hour12: false })}]
                            </span>
                            <span className="break-all">{log}</span>
                        </div>
                    ))}
                    {logs.length === 0 && (
                        <div className="h-full flex items-center justify-center opacity-20 italic">
                            Awaiting system log initialization...
                        </div>
                    )}
                </div>
            </div>

            {/* Advanced Metrics Footer (optional but recommended) */}
            {stats && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4"
                >
                    <MetricMiniCard label="Total Portfolio" value={`$${stats.totalPortfolioValue}`} />
                    <MetricMiniCard label="Net Profit" value={`$${stats.tradeStats.netProfit}`} />
                    <MetricMiniCard label="Total Trades" value={stats.tradeStats.tradeCount} />
                    <MetricMiniCard label="HODL Status" value={stats.hodlMode ? "LOCKED" : "ACTIVE"} />
                </motion.div>
            )}
        </div>
      </main>
    </div>
  );
}

function MetricMiniCard({ label, value }: { label: string, value: any }) {
    return (
        <div className="glass-card p-4 flex flex-col items-center justify-center gap-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{label}</span>
            <span className="text-lg font-black text-primary">{value}</span>
        </div>
    );
}
