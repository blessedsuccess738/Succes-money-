import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface TradeViewProps {
  asset: string;
  timeframe: string;
  signal: any;
}

export default function TradeView({ asset, timeframe, signal }: TradeViewProps) {
  const [price, setPrice] = useState(1.05432);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Simulate live price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPrice(prev => {
        const change = (Math.random() - 0.5) * 0.0005;
        setDirection(change >= 0 ? 'up' : 'down');
        return Number((prev + change).toFixed(5));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [asset]);

  // Handle countdown when signal is received
  useEffect(() => {
    if (signal) {
      const seconds = parseInt(timeframe.replace('s', '').replace('m', '')) * (timeframe.includes('m') ? 60 : 1);
      setCountdown(seconds);
    }
  }, [signal, timeframe]);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCountdown(null);
    }
  }, [countdown]);

  return (
    <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 relative overflow-hidden mb-8">
      {/* Background Chart Simulation */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M0 100 Q 25 50 50 75 T 100 25 L 100 100 Z" fill="currentColor" className="text-emerald-500" />
        </svg>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Asset Info */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-2xl shadow-inner">
            {asset.includes('EUR') ? '🇪🇺' : asset.includes('GBP') ? '🇬🇧' : asset.includes('BTC') ? '₿' : '🇺🇸'}
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide">{asset}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-2xl font-mono font-semibold ${direction === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {price.toFixed(5)}
              </span>
              {direction === 'up' ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-rose-400" />
              )}
            </div>
          </div>
        </div>

        {/* Signal Overlay */}
        {signal && countdown !== null && (
          <div className="flex-1 flex justify-center">
            <div className={`px-8 py-4 rounded-2xl border-2 flex items-center gap-4 shadow-2xl animate-in fade-in zoom-in duration-300 ${
              signal.signal === 'Buy' 
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-emerald-500/20' 
                : 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-rose-500/20'
            }`}>
              {signal.signal === 'Buy' ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
              <div>
                <div className="text-2xl font-black uppercase tracking-widest">{signal.signal}</div>
                <div className="text-sm font-medium opacity-80 flex items-center gap-1 mt-1">
                  <Clock className="w-4 h-4" />
                  {countdown}s remaining
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timeframe Info */}
        <div className="text-right hidden md:block">
          <div className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Timeframe</div>
          <div className="text-lg font-bold text-white bg-slate-700/50 px-4 py-2 rounded-lg border border-slate-600">
            {timeframe}
          </div>
        </div>
      </div>
    </div>
  );
}
