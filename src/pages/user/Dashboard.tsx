import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, LogOut, TrendingUp, ExternalLink } from 'lucide-react';
import { io } from 'socket.io-client';

const ASSETS = ['BTC/USD', 'ETH/USD', 'LTC/USD', 'EUR/USD', 'GBP/USD'];
const TIMEFRAMES = ['1min', '5min', '15min'];

export default function UserDashboard() {
  const [asset, setAsset] = useState(ASSETS[0]);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
  const [signal, setSignal] = useState<any>(null);
  const [liveSignals, setLiveSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) setUser(data.user);
        else navigate('/login');
      })
      .catch(() => navigate('/login'));
      
    const socket = io();
    socket.on('new_signal', (newSignal) => {
      setLiveSignals(prev => [newSignal, ...prev].slice(0, 10));
    });

    return () => {
      socket.disconnect();
    };
  }, [navigate]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/login');
  };

  const getSignal = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/signals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, timeframe }),
      });
      const data = await res.json();
      if (data.signal) {
        setSignal(data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <header className="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Activity className="text-emerald-400 w-6 h-6" />
          <h1 className="text-xl font-bold text-white">Signal Bot</h1>
        </div>
        <div className="flex items-center gap-4">
          <a 
            href="https://pocketoption.com/en/cabinet/demo-quick-high-low/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Trade on Pocket Option
          </a>
          <span className="text-sm text-slate-400">Welcome, {user.username}</span>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 mt-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700">
              <h2 className="text-2xl font-semibold text-white mb-6">Get New Signal</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Select Asset</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {ASSETS.map(a => (
                      <button
                        key={a}
                        onClick={() => setAsset(a)}
                        className={`py-2 px-4 rounded-lg border transition-all ${asset === a ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'}`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Timeframe</label>
                  <div className="flex gap-3">
                    {TIMEFRAMES.map(t => (
                      <button
                        key={t}
                        onClick={() => setTimeframe(t)}
                        className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-2 transition-all ${timeframe === t ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'}`}
                      >
                        <Clock className="w-4 h-4" />
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={getSignal}
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 text-lg"
                >
                  {loading ? 'Analyzing Market...' : (
                    <>
                      <TrendingUp className="w-6 h-6" />
                      Get Signal
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700 flex flex-col items-center justify-center min-h-[300px]">
              {signal ? (
                <div className="text-center w-full">
                  <h3 className="text-slate-400 mb-2">Signal Result</h3>
                  <div className="text-2xl font-bold text-white mb-6">
                    {signal.asset} <span className="text-slate-500 mx-2">•</span> {signal.timeframe}
                  </div>
                  <div className={`text-6xl font-black tracking-tight uppercase ${signal.signal === 'Buy' ? 'text-emerald-400' : 'text-rose-500'}`}>
                    {signal.signal}
                  </div>
                  
                  <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-700 pt-6">
                    <div>
                      <div className="text-slate-400 text-xs uppercase tracking-wider">RSI (14)</div>
                      <div className={`text-lg font-bold ${signal.rsi > 70 ? 'text-rose-400' : signal.rsi < 30 ? 'text-emerald-400' : 'text-slate-300'}`}>{signal.rsi}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs uppercase tracking-wider">MACD</div>
                      <div className="text-lg font-bold text-slate-300">{signal.macd}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs uppercase tracking-wider">Trend</div>
                      <div className={`text-lg font-bold ${signal.trend === 'Bullish' ? 'text-emerald-400' : 'text-rose-400'}`}>{signal.trend}</div>
                    </div>
                  </div>

                  <p className="mt-6 text-sm text-slate-500">
                    Signal generated at {new Date().toLocaleTimeString()}
                  </p>
                  
                  <a 
                    href="https://pocketoption.com/en/cabinet/demo-quick-high-low/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-6 inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-colors md:hidden"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Trade on Pocket Option
                  </a>
                </div>
              ) : (
                <div className="text-slate-500 text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p>Select an asset and timeframe to generate a signal.</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl shadow-lg border border-slate-700 overflow-hidden flex flex-col h-[700px]">
            <div className="p-4 border-b border-slate-700 bg-slate-800/50">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                Live Market Signals
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {liveSignals.length === 0 ? (
                <div className="text-center text-slate-500 mt-10">Waiting for signals...</div>
              ) : (
                liveSignals.map((s, i) => (
                  <div key={i} className="bg-slate-700/50 p-3 rounded-lg border border-slate-600/50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-white">{s.asset}</span>
                      <span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-sm text-slate-400">{s.timeframe}</span>
                      <span className={`font-bold ${s.signal === 'Buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {s.signal}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
