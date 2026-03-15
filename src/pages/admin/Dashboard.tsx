import { useState, useEffect, FormEvent, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Activity, Key, Settings, LogOut, ExternalLink, MessageSquare, Share2, LayoutDashboard, Globe, Power, Trash2, Crown, Ban, CheckCircle2, TrendingUp, TrendingDown, Terminal, Camera, RefreshCw } from 'lucide-react';
import Notifications from '../../components/Notifications';
import RemoteBrowser from '../../components/RemoteBrowser';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, getDocs, addDoc, orderBy, limit, getDoc, doc, serverTimestamp, onSnapshot, where, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { io } from 'socket.io-client';

const socket = io();

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [platformSettings, setPlatformSettings] = useState<any>({});
  
  // Access Code State
  const [newCode, setNewCode] = useState('');
  const [codeDuration, setCodeDuration] = useState('30'); // days
  
  // Signal Broadcaster State
  const [sigAsset, setSigAsset] = useState('EUR/USD');
  const [sigTimeframe, setSigTimeframe] = useState('1m');
  const [sigDirection, setSigDirection] = useState('Buy');
  const [sendingSignal, setSendingSignal] = useState(false);

  // Broadcast Message State
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();

  // Bot Console State
  const [botLogs, setBotLogs] = useState<{timestamp: string, message: string, userId: string}[]>([]);
  const [activeSessions, setActiveSessions] = useState<string[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [botLogs]);

  useEffect(() => {
    // Listen for bot logs
    socket.on('bot_log', (log) => {
      setBotLogs(prev => [...prev, log].slice(-200)); // Keep last 200 logs
    });

    return () => {
      socket.off('bot_log');
    };
  }, []);

  const fetchBotSessions = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/bot/sessions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.sessions) setActiveSessions(data.sessions);
    } catch (err) {
      console.error('Failed to fetch bot sessions', err);
    }
  };

  const fetchScreenshot = async (userId: string) => {
    if (!userId) return;
    setScreenshotLoading(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`/api/admin/bot/screenshot/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setScreenshot(data.image);
      } else {
        setScreenshot(null);
      }
    } catch (err) {
      console.error('Failed to fetch screenshot', err);
      setScreenshot(null);
    } finally {
      setScreenshotLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'bot-console') {
      fetchBotSessions();
      const interval = setInterval(fetchBotSessions, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    let unsubscribeUsers: () => void;
    let unsubscribeCodes: () => void;
    let unsubscribeSettings: () => void;
    let unsubscribeSignals: () => void;

    const setupSubscriptions = async () => {
      // Users
      const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

      // Codes
      const qCodes = query(collection(db, 'access_codes'), orderBy('createdAt', 'desc'));
      unsubscribeCodes = onSnapshot(qCodes, (snapshot) => {
        setCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'access_codes'));

      // Platform Settings
      unsubscribeSettings = onSnapshot(doc(db, 'settings', 'platform'), (docSnap) => {
        if (docSnap.exists()) {
          setPlatformSettings(docSnap.data());
        }
      });

      // Signals
      const qSignals = query(collection(db, 'signals'), orderBy('created_at', 'desc'), limit(50));
      unsubscribeSignals = onSnapshot(qSignals, (snapshot) => {
        setSignals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          if (userData?.role !== 'admin' && user.email !== 'blessedsuccess738@gmail.com') {
            navigate('/meta');
          } else {
            setCurrentUser({ ...user, ...userData });
            setupSubscriptions();
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
        }
      } else {
        navigate('/meta');
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribeCodes) unsubscribeCodes();
      if (unsubscribeSettings) unsubscribeSettings();
      if (unsubscribeSignals) unsubscribeSignals();
    };
  }, [navigate]);

  // --- Access Codes ---
  const generateCode = async () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
      await addDoc(collection(db, 'access_codes'), {
        code,
        durationDays: codeDuration === 'lifetime' ? 9999 : parseInt(codeDuration),
        isUsed: false,
        usedBy: null,
        usedByUsername: null,
        createdAt: serverTimestamp()
      });
      setNewCode(code);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'access_codes');
    }
  };

  const revokeCode = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke and delete this code?')) return;
    try {
      await deleteDoc(doc(db, 'access_codes', id));
    } catch (error) {
      console.error(error);
    }
  };

  // --- User Management ---
  const toggleVIP = async (userId: string, currentLevel: string) => {
    try {
      const newLevel = currentLevel === 'Premium Member' ? 'Rookie' : 'Premium Member';
      await updateDoc(doc(db, 'users', userId), { level: newLevel });
    } catch (error) {
      console.error(error);
    }
  };

  const toggleBan = async (userId: string, isBanned: boolean) => {
    if (!window.confirm(`Are you sure you want to ${isBanned ? 'unban' : 'ban'} this user?`)) return;
    try {
      await updateDoc(doc(db, 'users', userId), { isBanned: !isBanned });
    } catch (error) {
      console.error(error);
    }
  };

  // --- Platform Settings ---
  const savePlatformSettings = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'platform'), platformSettings, { merge: true });
      alert('Platform settings saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save settings.');
    }
  };

  const toggleMasterKillSwitch = async () => {
    const newValue = !platformSettings.masterKillSwitch;
    if (newValue && !window.confirm('WARNING: This will instantly stop all auto-trading for all users. Proceed?')) return;
    try {
      await setDoc(doc(db, 'settings', 'platform'), { masterKillSwitch: newValue }, { merge: true });
    } catch (error) {
      console.error(error);
    }
  };

  // --- Signal Broadcaster ---
  const broadcastSignal = async (e: FormEvent) => {
    e.preventDefault();
    setSendingSignal(true);
    try {
      await addDoc(collection(db, 'signals'), {
        asset: sigAsset,
        timeframe: sigTimeframe,
        signal: sigDirection,
        source: 'Manual Admin',
        username: 'Admin',
        created_at: new Date().toISOString(),
        timestamp: serverTimestamp()
      });
      alert('Signal broadcasted to all users!');
    } catch (error) {
      console.error(error);
      alert('Failed to broadcast signal.');
    }
    setSendingSignal(false);
  };

  // --- Logout ---
  const handleLogout = async () => {
    await signOut(auth);
    navigate('/meta');
  };

  // --- Stats Calculations ---
  const activeTradersCount = users.filter(u => u.is_live_synced).length;
  const activeSubscriptions = codes.filter(c => c.isUsed).length;
  const totalWins = users.reduce((sum, u) => sum + (u.win_count || 0), 0);
  const totalLosses = users.reduce((sum, u) => sum + (u.loss_count || 0), 0);
  const totalProfitAmount = users.reduce((sum, u) => sum + (u.total_profit || 0), 0);
  const totalLossAmount = users.reduce((sum, u) => sum + (u.total_loss || 0), 0);
  const globalWinRate = totalWins + totalLosses > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <Shield className="w-8 h-8 text-indigo-500" />
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <LayoutDashboard className="w-5 h-5" /> Overview
          </button>
          <button onClick={() => setActiveTab('codes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'codes' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Key className="w-5 h-5" /> Access Codes
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Users & VIP
          </button>
          <button onClick={() => setActiveTab('signals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'signals' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Activity className="w-5 h-5" /> Signal Broadcaster
          </button>
          <button onClick={() => setActiveTab('bot-engine')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'bot-engine' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Power className="w-5 h-5" /> Bot Engine
          </button>
          <button onClick={() => setActiveTab('bot-console')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'bot-console' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Terminal className="w-5 h-5" /> Bot Console (Dev)
          </button>
          <button onClick={() => setActiveTab('platform')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'platform' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Globe className="w-5 h-5" /> Platform Links
          </button>
          <button onClick={() => setActiveTab('browser')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'browser' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <ExternalLink className="w-5 h-5" /> Pocket Option
          </button>
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors">
            <LogOut className="w-5 h-5" /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-slate-900 border-b border-slate-800 p-6 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-white capitalize">{activeTab.replace('-', ' ')}</h2>
          <Notifications user={{ role: 'admin' }} />
        </header>
        
        <div className="flex-1 overflow-auto p-6">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Primary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-bl-full"></div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Total Users</h3>
                    <Users className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="text-3xl font-bold text-white">{users.length}</div>
                  <p className="text-xs text-slate-500 mt-2">Registered accounts</p>
                </div>
                
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full"></div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Total Profit (Wins)</h3>
                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-3xl font-bold text-emerald-400">${totalProfitAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                  <p className="text-xs text-slate-500 mt-2">Across {totalWins} winning trades</p>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-bl-full"></div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Total Loss</h3>
                    <TrendingDown className="w-6 h-6 text-rose-400" />
                  </div>
                  <div className="text-3xl font-bold text-rose-400">${totalLossAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                  <p className="text-xs text-slate-500 mt-2">Across {totalLosses} losing trades</p>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-full"></div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Global Win Rate</h3>
                    <Activity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="text-3xl font-bold text-blue-400">{globalWinRate}%</div>
                  <p className="text-xs text-slate-500 mt-2">Average platform accuracy</p>
                </div>
              </div>

              {/* Secondary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Active Subscriptions</h3>
                    <Key className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{activeSubscriptions}</div>
                </div>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Live Auto-Traders</h3>
                    <Power className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{activeTradersCount}</div>
                </div>
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-slate-400 font-medium">Signals Broadcasted</h3>
                    <Share2 className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{signals.length}</div>
                </div>
              </div>
            </div>
          )}

          {/* ACCESS CODES TAB */}
          {activeTab === 'codes' && (
            <div className="space-y-6">
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1">Generate Access Code</h3>
                  <p className="text-sm text-slate-400">Create a new code for user registration.</p>
                </div>
                <div className="flex items-center gap-4">
                  <select 
                    value={codeDuration}
                    onChange={(e) => setCodeDuration(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="1">1 Day</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="lifetime">Lifetime</option>
                  </select>
                  <button onClick={generateCode} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    Generate
                  </button>
                </div>
              </div>

              {newCode && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-6 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-emerald-400 font-medium mb-1">New Code Generated!</p>
                    <p className="text-sm text-slate-400">Copy this and send it to your customer.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-white bg-slate-900 px-6 py-3 rounded-lg text-2xl tracking-widest border border-slate-700">{newCode}</span>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(newCode); alert('Copied!'); }}
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>
                      <th className="p-4">Code</th>
                      <th className="p-4">Duration</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Used By</th>
                      <th className="p-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {codes.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-800/50">
                        <td className="p-4 font-mono text-white tracking-wider">{c.code}</td>
                        <td className="p-4 text-slate-400">{c.durationDays === 9999 ? 'Lifetime' : `${c.durationDays} Days`}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs ${c.isUsed ? 'bg-slate-700 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {c.isUsed ? 'Used' : 'Available'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{c.usedByUsername || '-'}</td>
                        <td className="p-4">
                          <button onClick={() => revokeCode(c.id)} className="text-rose-400 hover:text-rose-300 p-2 rounded hover:bg-rose-500/10 transition-colors" title="Revoke & Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="p-4">User</th>
                    <th className="p-4">Pocket Option</th>
                    <th className="p-4">Settings (TP / SL)</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u: any) => (
                    <tr key={u.id} className={`hover:bg-slate-800/50 ${u.isBanned ? 'opacity-50' : ''}`}>
                      <td className="p-4">
                        <div className="font-medium text-white flex items-center gap-2">
                          {u.email || u.username}
                          {u.level === 'Premium Member' && <Crown className="w-4 h-4 text-amber-400" />}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-1">{u.id}</div>
                      </td>
                      <td className="p-4">
                        {u.pocketOptionId ? (
                          <span className="text-emerald-400 font-mono text-xs bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">Linked: {u.pocketOptionId}</span>
                        ) : (
                          <span className="text-slate-500 text-xs">Not Linked</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-400 font-mono text-xs">
                        {u.tradeSettings ? (
                          <>+${u.tradeSettings.takeProfit} / -${u.tradeSettings.stopLoss}</>
                        ) : 'Not Set'}
                      </td>
                      <td className="p-4">
                        {u.isBanned ? (
                          <span className="text-rose-400 text-xs font-bold uppercase">Banned</span>
                        ) : u.is_live_synced ? (
                          <span className="text-blue-400 text-xs font-bold uppercase flex items-center gap-1"><Activity className="w-3 h-3"/> Trading</span>
                        ) : (
                          <span className="text-slate-500 text-xs font-bold uppercase">Idle</span>
                        )}
                      </td>
                      <td className="p-4 flex items-center gap-2">
                        <button
                          onClick={() => toggleVIP(u.id, u.level)}
                          className={`px-3 py-1 rounded text-xs font-bold transition-colors ${u.level === 'Premium Member' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                          VIP
                        </button>
                        <button
                          onClick={() => toggleBan(u.id, u.isBanned)}
                          className={`p-1.5 rounded transition-colors ${u.isBanned ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'}`}
                          title={u.isBanned ? "Unban User" : "Ban User"}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SIGNAL BROADCASTER TAB */}
          {activeTab === 'signals' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-indigo-400" />
                  Manual Signal Broadcaster
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Push a signal instantly to all active users. This will trigger auto-trading for users who have it enabled.
                </p>
                <form onSubmit={broadcastSignal} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-2">Asset</label>
                    <select value={sigAsset} onChange={(e) => setSigAsset(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                      <option value="EUR/USD">EUR/USD</option>
                      <option value="GBP/USD">GBP/USD</option>
                      <option value="USD/JPY">USD/JPY</option>
                      <option value="BTC/USD">BTC/USD</option>
                      <option value="EUR/USD OTC">EUR/USD OTC</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Timeframe</label>
                      <select value={sigTimeframe} onChange={(e) => setSigTimeframe(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                        <option value="1m">1 Minute</option>
                        <option value="5m">5 Minutes</option>
                        <option value="15m">15 Minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-400 mb-2">Direction</label>
                      <select value={sigDirection} onChange={(e) => setSigDirection(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500">
                        <option value="Buy">BUY (UP)</option>
                        <option value="Sell">SELL (DOWN)</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={sendingSignal}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white px-6 py-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 mt-4"
                  >
                    <Share2 className="w-5 h-5" />
                    {sendingSignal ? 'Broadcasting...' : 'BROADCAST SIGNAL NOW'}
                  </button>
                </form>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-800">
                  <h3 className="text-lg font-semibold text-white">Recent Signals</h3>
                </div>
                <div className="flex-1 overflow-auto p-0">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-800 text-slate-400">
                      <tr>
                        <th className="p-4">Time</th>
                        <th className="p-4">Asset</th>
                        <th className="p-4">Signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {signals.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-800/50">
                          <td className="p-4 text-slate-400 text-xs">{new Date(s.created_at).toLocaleTimeString()}</td>
                          <td className="p-4 font-medium text-white">{s.asset} <span className="text-slate-500 text-xs ml-1">{s.timeframe}</span></td>
                          <td className="p-4">
                            <span className={`font-bold ${s.signal === 'Buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {s.signal}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* BOT ENGINE TAB */}
          {activeTab === 'bot-engine' && (
            <div className="space-y-6">
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-8 flex flex-col items-center justify-center text-center">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${platformSettings.masterKillSwitch ? 'bg-rose-500/20 text-rose-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                  <Power className="w-12 h-12" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Master Kill Switch</h3>
                <p className="text-slate-400 max-w-md mb-8">
                  {platformSettings.masterKillSwitch 
                    ? "AUTO-TRADING IS CURRENTLY DISABLED FOR ALL USERS." 
                    : "Auto-trading is active. Users can connect and trade."}
                </p>
                <button
                  onClick={toggleMasterKillSwitch}
                  className={`px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${platformSettings.masterKillSwitch ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'}`}
                >
                  {platformSettings.masterKillSwitch ? 'ENABLE AUTO-TRADING' : 'EMERGENCY STOP ALL TRADING'}
                </button>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-slate-400" />
                  Live Robot Logs (Puppeteer)
                </h3>
                <div className="bg-black rounded-lg p-4 font-mono text-xs text-emerald-400 h-64 overflow-y-auto border border-slate-800">
                  <div className="opacity-50">[SYSTEM] Backend robot initialized.</div>
                  <div className="opacity-50">[SYSTEM] Waiting for user connections...</div>
                  {users.filter(u => u.is_live_synced).map(u => (
                    <div key={u.id} className="mt-1">
                      [INFO] Monitoring active session for user: {u.email || u.username}
                    </div>
                  ))}
                  {platformSettings.masterKillSwitch && (
                    <div className="text-rose-500 mt-2 font-bold">[ALERT] MASTER KILL SWITCH ENGAGED. ALL TRADING HALTED.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BOT CONSOLE TAB */}
          {activeTab === 'bot-console' && (
            <div className="space-y-6 flex flex-col h-full">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Terminal className="w-6 h-6 text-indigo-400" />
                  Bot Console (Dev Tools)
                </h2>
                <button 
                  onClick={fetchBotSessions}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Sessions
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[600px]">
                {/* Left Column: Live Terminal */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col">
                  <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                      <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span className="ml-2 text-xs text-slate-400 font-mono">puppeteer-engine.log</span>
                    </div>
                    <button onClick={() => setBotLogs([])} className="text-xs text-slate-500 hover:text-white">Clear</button>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto font-mono text-xs sm:text-sm bg-[#0A0A0A]">
                    {botLogs.length === 0 ? (
                      <div className="text-slate-600 italic">Waiting for bot activity...</div>
                    ) : (
                      botLogs.map((log, i) => (
                        <div key={i} className="mb-1 flex gap-3">
                          <span className="text-slate-500 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className="text-emerald-400 shrink-0">[{log.userId.substring(0,6)}]</span>
                          <span className="text-slate-300">{log.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={logsEndRef} />
                  </div>
                </div>

                {/* Right Column: Sessions & Screenshots */}
                <div className="space-y-6 flex flex-col">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex-1 overflow-y-auto max-h-[300px]">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-emerald-400" />
                      Active Sessions ({activeSessions.length})
                    </h3>
                    {activeSessions.length === 0 ? (
                      <p className="text-slate-500 text-sm">No active browser sessions.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeSessions.map(id => (
                          <button
                            key={id}
                            onClick={() => {
                              setSelectedSession(id);
                              fetchScreenshot(id);
                            }}
                            className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${selectedSession === id ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                          >
                            <div className="font-mono text-sm">User ID: {id.substring(0, 8)}...</div>
                            <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                              Browser Active
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex-1 flex flex-col min-h-[300px]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Camera className="w-5 h-5 text-indigo-400" />
                        Live Viewer
                      </h3>
                      {selectedSession && (
                        <button 
                          onClick={() => fetchScreenshot(selectedSession)}
                          disabled={screenshotLoading}
                          className="text-xs bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${screenshotLoading ? 'animate-spin' : ''}`} />
                          Capture
                        </button>
                      )}
                    </div>
                    
                    <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex items-center justify-center relative">
                      {!selectedSession ? (
                        <p className="text-slate-500 text-sm text-center px-4">Select an active session above to view its live browser screen.</p>
                      ) : screenshotLoading && !screenshot ? (
                        <div className="flex flex-col items-center gap-2 text-indigo-400">
                          <RefreshCw className="w-6 h-6 animate-spin" />
                          <span className="text-sm">Capturing...</span>
                        </div>
                      ) : screenshot ? (
                        <img src={screenshot} alt="Browser Screenshot" className="w-full h-full object-contain" />
                      ) : (
                        <p className="text-rose-400 text-sm text-center px-4">Failed to capture screenshot. The session may have closed.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PLATFORM SETTINGS TAB */}
          {activeTab === 'platform' && (
            <div className="max-w-2xl bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Platform Customization</h3>
              <p className="text-slate-400 text-sm mb-6">Update the support links shown in the floating widget for all users.</p>
              
              <form onSubmit={savePlatformSettings} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Telegram Group/Channel Link</label>
                  <input
                    type="url"
                    value={platformSettings.telegram || ''}
                    onChange={(e) => setPlatformSettings({...platformSettings, telegram: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="https://t.me/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Support Email Address</label>
                  <input
                    type="email"
                    value={platformSettings.email?.replace('mailto:', '') || ''}
                    onChange={(e) => setPlatformSettings({...platformSettings, email: `mailto:${e.target.value}`})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="support@domain.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">WhatsApp Channel Link</label>
                  <input
                    type="url"
                    value={platformSettings.whatsapp || ''}
                    onChange={(e) => setPlatformSettings({...platformSettings, whatsapp: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="https://wa.me/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">WhatsApp Business (Admin VIP) Link</label>
                  <input
                    type="url"
                    value={platformSettings.whatsappBusiness || ''}
                    onChange={(e) => setPlatformSettings({...platformSettings, whatsappBusiness: e.target.value})}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="https://wa.me/..."
                  />
                </div>
                
                <button
                  type="submit"
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Save Platform Links
                </button>
              </form>
            </div>
          )}

          {/* BROWSER TAB (Remote Puppeteer View) */}
          {activeTab === 'browser' && (
            <div className="h-full flex flex-col gap-4">
              <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div>
                  <h3 className="text-white font-semibold">Remote Browser View</h3>
                  <p className="text-xs text-slate-500">Interact with active user sessions in real-time.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select 
                    value={selectedSession || ''} 
                    onChange={(e) => setSelectedSession(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
                  >
                    <option value="">Select a Session</option>
                    {activeSessions.map(id => (
                      <option key={id} value={id}>User: {id.substring(0, 8)}...</option>
                    ))}
                  </select>
                  <button 
                    onClick={fetchBotSessions}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {selectedSession ? (
                  <RemoteBrowser 
                    userId={selectedSession} 
                    adminToken={localStorage.getItem('admin_token') || ''} 
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-slate-900 rounded-xl border border-slate-800 border-dashed text-slate-500">
                    <Globe className="w-12 h-12 mb-4 opacity-20" />
                    <p>Select an active session to start remote browsing</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
