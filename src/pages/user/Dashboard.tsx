import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, LogOut, TrendingUp, ExternalLink, ChevronDown } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, limit } from 'firebase/firestore';
import TradeView from '../../components/TradeView';
import Notifications from '../../components/Notifications';
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

            // Check pocket option id
            if (!userData.pocketOptionId) {
              navigate('/connect-broker');
              return;
            }

            setUser({ ...userData, uid: firebaseUser.uid } as any);
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

    return () => {
      unsubscribeAuth();
      socket.off('new_signal');
    };
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
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
            <span className="text-sm font-medium text-white">{user.username}</span>
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
                        <span className="font-medium text-white">{s.asset}</span>
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
