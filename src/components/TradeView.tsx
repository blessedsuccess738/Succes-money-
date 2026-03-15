import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Clock, ArrowUpCircle, ArrowDownCircle, MonitorPlay, LineChart } from 'lucide-react';
import UserRemoteBrowser from './UserRemoteBrowser';

interface TradeViewProps {
  asset: string;
  timeframe: string;
  signal: any;
  token: string;
  userId: string;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

export default function TradeView({ asset, timeframe, signal, token, userId }: TradeViewProps) {
  const [price, setPrice] = useState(1.05432);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'chart' | 'broker'>('chart');
  const [affiliateLink, setAffiliateLink] = useState('https://pocketoption.com/register');
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/public/settings')
      .then(res => res.json())
      .then(data => {
        if (data.pocket_option_affiliate_link) {
          setAffiliateLink(data.pocket_option_affiliate_link);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    let tvWidget: any = null;
    
    const initWidget = () => {
      if (viewMode === 'chart' && container.current && window.TradingView) {
        // Clear previous widget
        container.current.innerHTML = '';
        
        tvWidget = new window.TradingView.widget({
          autosize: true,
          symbol: asset.replace(' OTC', '').replace('/', ''),
          interval: timeframe.includes('s') ? '1' : timeframe.replace('m', ''),
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#f1f3f6',
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: container.current.id,
          backgroundColor: 'rgba(15, 23, 42, 1)',
          gridColor: 'rgba(30, 41, 59, 1)',
        });
      }
    };

    if (!document.getElementById('tradingview-script')) {
      const script = document.createElement('script');
      script.id = 'tradingview-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      if (viewMode === 'chart') {
        initWidget();
      }
    }

    return () => {
      if (tvWidget) {
        try {
          tvWidget.remove();
        } catch (e) {
          // Ignore
        }
      }
    };
  }, [asset, timeframe, viewMode]);

  // Simulate live price updates (keeping for the UI display)
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
    <div className="space-y-8 mb-8">
      <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 relative overflow-hidden">
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

          {/* Timeframe Info */}
          <div className="flex items-center gap-4">
            <div className="bg-slate-900/50 p-1 rounded-xl border border-slate-700 flex">
              <button 
                onClick={() => setViewMode('chart')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'chart' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <LineChart className="w-4 h-4" />
                Pro Chart
              </button>
              <button 
                onClick={() => setViewMode('broker')}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-bold transition-all ${viewMode === 'broker' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <MonitorPlay className="w-4 h-4" />
                Broker View
              </button>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Timeframe</div>
              <div className="text-lg font-bold text-white bg-slate-700/50 px-4 py-2 rounded-lg border border-slate-600">
                {timeframe}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden h-[600px] relative">
        {viewMode === 'chart' ? (
          <div id="tradingview_widget" ref={container} className="w-full h-full" />
        ) : (
          <div className="w-full h-full bg-slate-900 relative">
            <UserRemoteBrowser token={token} userId={userId} />
          </div>
        )}
        
        {/* On-Chart Signal Overlay (HUD) */}
        {signal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-slate-900/40 backdrop-blur-sm">
            <div className={`px-12 py-8 rounded-3xl border-4 flex flex-col items-center gap-4 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in duration-500 ${
              signal.signal === 'Buy' 
                ? 'bg-emerald-900/90 border-emerald-400 text-emerald-400 shadow-emerald-500/50' 
                : 'bg-rose-900/90 border-rose-400 text-rose-400 shadow-rose-500/50'
            }`}>
              <div className="text-white font-bold text-xl tracking-widest opacity-80">{signal.asset}</div>
              
              <div className="flex items-center gap-6">
                {signal.signal === 'Buy' ? <TrendingUp className="w-20 h-20" /> : <TrendingDown className="w-20 h-20" />}
                <div className="text-7xl font-black uppercase tracking-tighter drop-shadow-2xl">
                  {signal.signal}
                </div>
              </div>

              <div className="mt-4 text-xl font-bold text-white bg-black/30 px-6 py-2 rounded-full flex items-center gap-2 border border-white/10">
                <Clock className="w-5 h-5 text-emerald-400" />
                Expires in {countdown || timeframe}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
