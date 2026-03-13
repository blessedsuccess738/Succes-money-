import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, LogOut, TrendingUp, ExternalLink, ChevronDown, ShieldCheck, Wallet, RefreshCcw, Power, Settings } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore';
import TradeView from '../../components/TradeView';
import Notifications from '../../components/Notifications';
import PocketOptionOnboarding from '../../components/PocketOptionOnboarding';
import AutoTradeSettings from '../../components/AutoTradeSettings';
import { io } from 'socket.io-client';

const socket = io();

const ASSETS = [
  { name: 'EUR/USD', flags: '🇪🇺 🇺🇸' },
  { name: 'GBP/USD', flags: '🇬🇧 🇺🇸' },
  { name: 'USD/JPY', flags: '🇺🇸 🇯🇵' },
  { name: 'AUD/USD', flags: '🇦🇺 🇺🇸' },
  { name: 'USD/CAD', flags: '🇺🇸 🇨🇦' },
  { name: 'EUR/GBP', flags: '🇪🇺 🇬🇧' },
  { name: 'BTC/USD', flags: '₿ 🇺🇸' },
  { name: 'EUR/USD OTC', flags: '🇪🇺 🇺🇸' },
  { name: 'GBP/USD OTC', flags: '🇬🇧 🇺🇸' },
  { name: 'USD/JPY OTC', flags: '🇺🇸 🇯🇵' },
  { name: 'AUD/USD OTC', flags: '🇦🇺 🇺🇸' },
  { name: 'USD/CAD OTC', flags: '🇺🇸 🇨🇦' },
  { name: 'EUR/GBP OTC', flags: '🇪🇺 🇬🇧' },
  { name: 'BTC/USD OTC', flags: '₿ 🇺🇸' }
];
const TIMEFRAMES = ['5s', '10s', '15s', '30s', '1m', '3m', '5m'];

export default function UserDashboard() {
  const [asset, setAsset] = useState(ASSETS[0].name);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);
  const [signal, setSignal] = useState<any>(null);
  const [liveSignals, setLiveSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{ username: string } | null>(null);
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [showTimeframeDropdown, setShowTimeframeDropdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          if (userData) {
            if (userData.role === 'admin') {
              navigate('/admin');
              return;
            }

            // Check access code
            const qCode = query(collection(db, 'access_codes'), where('usedBy', '==', firebaseUser.uid));
            const codeSnap = await getDocs(qCode);
            if (codeSnap.empty) {
              navigate('/verify-code');
              return;
            }

            // We no longer redirect if pocketOptionId is missing, we show the onboarding modal.
            setUser({ ...userData, uid: firebaseUser.uid } as any);

            // Fetch additional bot profile data from SQLite backend
            const token = await firebaseUser.getIdToken();
            const profileRes = await fetch('/api/user/profile', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              setUser(prev => prev ? { ...prev, ...profileData } : null);
            }
          } else {
            navigate('/login');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + firebaseUser.uid);
        }
      } else {
        navigate('/login');
      }
    });

    // Listen for live signals via Socket.io
    socket.on('new_signal', (newSignal: any) => {
      setLiveSignals(prev => [newSignal, ...prev].slice(0, 10));
    });

    socket.on('view_synced', (data: { asset: string, timeframe: string }) => {
      setAsset(data.asset);
      setTimeframe(data.timeframe);
      // Optional: show a small toast or notification that view was synced
      console.log('View synced by admin:', data);
    });

    socket.on('user_update', (data: { trade_count: number, level: string }) => {
      setUser((prev: any) => prev ? { ...prev, trade_count: data.trade_count, level: data.level } : null);
    });

    socket.on('balance_update', (data: { balance: number }) => {
      setUser((prev: any) => prev ? { ...prev, balance: data.balance } : null);
    });

    socket.on('sync_status', (data: { is_live_synced: boolean, balance?: number, status: string }) => {
      setUser((prev: any) => prev ? { ...prev, is_live_synced: data.is_live_synced, balance: data.balance ?? prev.balance } : null);
    });

    return () => {
      unsubscribeAuth();
      socket.off('new_signal');
      socket.off('view_synced');
    };
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const toggleSync = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const endpoint = user.is_live_synced ? '/api/sync/stop' : '/api/sync/start';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Sync toggle failed');
    } catch (err) {
      console.error('Sync error:', err);
    }
  };

  const getSignal = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/signals/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ asset, timeframe })
      });

      if (!response.ok) {
        throw new Error('Failed to generate signal');
      }

      const newSignal = await response.json();
      setSignal(newSignal);
      
      // Also save to Firestore for history if needed, or just rely on the backend
      // The user asked for it to be saved to the "signals table" (SQLite)
      // and broadcasted via Socket.io, which we handled.
      
    } catch (err) {
      console.error('Signal generation error:', err);
    }
    setLoading(false);
  };

  if (!user) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      {!user.pocketOptionId && (
        <PocketOptionOnboarding 
          user={user} 
          onComplete={(pocketId) => {
            setUser(prev => prev ? { ...prev, pocketOptionId: pocketId } : null);
          }} 
        />
      )}
      {showSettings && (
        <AutoTradeSettings 
          user={user}
          onClose={() => setShowSettings(false)}
          onSave={(settings) => {
            setUser(prev => prev ? { ...prev, tradeSettings: settings } : null);
          }}
        />
      )}
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
          
          <Notifications user={user} />
          
          <div className="hidden sm:flex flex-col items-end mr-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{user.username}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                user.level === 'Elite Legend' ? 'bg-amber-500 text-black' :
                user.level === 'Premium Member' ? 'bg-indigo-500 text-white' :
                user.level === 'Trade Master' ? 'bg-emerald-500 text-white' :
                user.level === 'Pro Trader' ? 'bg-blue-500 text-white' :
                user.level === 'Active Trader' ? 'bg-slate-600 text-white' :
                'bg-slate-700 text-slate-400'
              }`}>
                {user.level || 'Rookie'}
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono">ID: {user.pocketOptionId}</span>
          </div>
          
          <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 mt-8">
        <TradeView asset={asset} timeframe={timeframe} signal={signal} />

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Reputation Card */}
                <div className="bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    Reputation Level
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-2xl font-bold text-white">{user.level || 'Rookie'}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Current Rank</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-mono text-emerald-400 font-bold">{user.trade_count || 0}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Total Trades</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <span>Progress to Next Rank</span>
                        <span>{Math.min(100, Math.floor(((user.trade_count || 0) / 500) * 100))}%</span>
                      </div>
                      <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full transition-all duration-1000"
                          style={{ width: `${Math.min(100, Math.floor(((user.trade_count || 0) / 500) * 100))}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Sync Card */}
                <div className="bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700 relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-3xl transition-colors duration-1000 ${user.is_live_synced ? 'bg-emerald-500/20' : 'bg-rose-500/10'}`}></div>
                  
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <ShieldCheck className={`w-5 h-5 ${user.is_live_synced ? 'text-emerald-400' : 'text-slate-500'}`} />
                      Live Account
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-lg transition-all bg-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700"
                        title="Auto-Trade Settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={toggleSync}
                        className={`p-2 rounded-lg transition-all ${user.is_live_synced ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'}`}
                        title={user.is_live_synced ? "Stop Auto-Trading" : "Start Auto-Trading"}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center">
                        <Wallet className={`w-6 h-6 ${user.is_live_synced ? 'text-emerald-400' : 'text-slate-500'}`} />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white font-mono">
                          {user.is_live_synced ? `$${(user.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '----.--'}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${user.is_live_synced ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            {user.is_live_synced ? 'Live Connection Active' : 'Disconnected'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {user.is_live_synced && (
                      <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Syncing with Cabinet</span>
                        <RefreshCcw className="w-3 h-3 text-emerald-500 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-800 p-6 rounded-2xl shadow-lg border border-slate-700">
              <h2 className="text-2xl font-semibold text-white mb-6">Get New Signal</h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Asset Dropdown */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-400 mb-2">Select Asset</label>
                    <button
                      onClick={() => { setShowAssetDropdown(!showAssetDropdown); setShowTimeframeDropdown(false); }}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 flex items-center justify-between text-white hover:border-slate-500 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl tracking-widest">{ASSETS.find(a => a.name === asset)?.flags}</span>
                        <span className="font-medium text-lg">{asset}</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 transition-transform ${showAssetDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showAssetDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowAssetDropdown(false)} />
                        <div className="absolute top-[80px] left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
                          {ASSETS.map(a => (
                            <button
                              key={a.name}
                              onClick={() => { setAsset(a.name); setShowAssetDropdown(false); }}
                              className={`w-full text-left p-3 flex items-center gap-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 ${asset === a.name ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-200'}`}
                            >
                              <span className="text-xl tracking-widest">{a.flags}</span>
                              <span className="font-medium">{a.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Timeframe Dropdown */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-400 mb-2">Timeframe</label>
                    <button
                      onClick={() => { setShowTimeframeDropdown(!showTimeframeDropdown); setShowAssetDropdown(false); }}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg p-3 flex items-center justify-between text-white hover:border-slate-500 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-emerald-400" />
                        <span className="font-medium text-lg">{timeframe}</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 transition-transform ${showTimeframeDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {showTimeframeDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowTimeframeDropdown(false)} />
                        <div className="absolute top-[80px] left-0 right-0 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto custom-scrollbar">
                          {TIMEFRAMES.map(t => (
                            <button
                              key={t}
                              onClick={() => { setTimeframe(t); setShowTimeframeDropdown(false); }}
                              className={`w-full text-left p-3 flex items-center gap-3 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0 ${timeframe === t ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-200'}`}
                            >
                              <Clock className="w-4 h-4 opacity-50" />
                              <span className="font-medium">{t}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
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
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{s.asset}</span>
                          {s.source && s.source !== 'Manual' && (
                            <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/30 uppercase font-bold">
                              {s.source}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">User: {s.username}</span>
                      </div>
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
