import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Activity, Key, Settings, LogOut, ExternalLink, MessageSquare } from 'lucide-react';
import Notifications from '../../components/Notifications';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, getDocs, addDoc, orderBy, limit, getDoc, doc, serverTimestamp } from 'firebase/firestore';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('browser');
  const [users, setUsers] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [codes, setCodes] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          if (userData?.role !== 'admin' && user.email !== 'blessedsuccess738@gmail.com') {
            navigate('/meta');
          } else {
            setCurrentUser({ ...user, ...userData });
            fetchData();
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
        }
      } else {
        navigate('/meta');
      }
    });
    return () => unsubscribe();
  }, [activeTab, navigate]);

  const fetchData = async () => {
    try {
      if (activeTab === 'users') {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        try {
          const snapshot = await getDocs(q);
          setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'users');
        }
      } else if (activeTab === 'signals') {
        const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(100));
        try {
          const snapshot = await getDocs(q);
          setSignals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'signals');
        }
      } else if (activeTab === 'codes') {
        const q = query(collection(db, 'access_codes'), orderBy('createdAt', 'desc'));
        try {
          const snapshot = await getDocs(q);
          setCodes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'access_codes');
        }
      } else if (activeTab === 'settings') {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/admin/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          // Ensure pocket_option_api_key exists in the list for the UI
          if (!data.find((s: any) => s.key === 'pocket_option_api_key')) {
            data.push({ key: 'pocket_option_api_key', value: '' });
          }
          setSettings(data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateCode = async () => {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
      await addDoc(collection(db, 'access_codes'), {
        code,
        isUsed: false,
        usedBy: null,
        usedByUsername: null,
        createdAt: serverTimestamp()
      });
      setNewCode(code);
      fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'access_codes');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/meta');
  };

  const handleBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    
    setSendingBroadcast(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title: 'Admin Broadcast',
        message: broadcastMessage,
        type: 'broadcast',
        isRead: false,
        createdAt: serverTimestamp()
      });
      setBroadcastMessage('');
      alert('Broadcast message sent successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    }
    setSendingBroadcast(false);
  };

  const updateSetting = async (key: string, value: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ key, value })
      });
      if (response.ok) {
        alert('Setting updated successfully');
        fetchData();
      } else {
        alert('Failed to update setting');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating setting');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <Shield className="w-8 h-8 text-indigo-500" />
          <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('browser')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'browser' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <ExternalLink className="w-5 h-5" /> Pocket Option
          </button>
          <button onClick={() => setActiveTab('users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Users className="w-5 h-5" /> Users
          </button>
          <button onClick={() => setActiveTab('signals')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'signals' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Activity className="w-5 h-5" /> Signal Logs
          </button>
          <button onClick={() => setActiveTab('codes')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'codes' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Key className="w-5 h-5" /> Access Codes
          </button>
          <button onClick={() => setActiveTab('broadcast')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'broadcast' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <MessageSquare className="w-5 h-5" /> Broadcast
          </button>
          <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-slate-800'}`}>
            <Settings className="w-5 h-5" /> Settings
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
          {activeTab === 'browser' && (
            <div className="h-full w-full bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <iframe 
                src="https://pocketoption.com/en/cabinet/demo-quick-high-low/" 
                className="w-full h-full border-0"
                title="Pocket Option"
              />
            </div>
          )}

          {activeTab === 'users' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Role</th>
                    <th className="p-4">Pocket Option ID</th>
                    <th className="p-4">IP Address</th>
                    <th className="p-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-slate-800/50">
                      <td className="p-4">{u.id}</td>
                      <td className="p-4 font-medium text-white">{u.username}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs ${u.role === 'admin' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-emerald-400">{u.pocketOptionId || 'Not Linked'}</td>
                      <td className="p-4 font-mono text-slate-400">{u.ipAddress || 'N/A'}</td>
                      <td className="p-4 text-slate-400">{u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'signals' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="p-4">Time</th>
                    <th className="p-4">User</th>
                    <th className="p-4">Asset</th>
                    <th className="p-4">Timeframe</th>
                    <th className="p-4">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {signals.map((s: any) => (
                    <tr key={s.id} className="hover:bg-slate-800/50">
                      <td className="p-4 text-slate-400">{s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString() : 'N/A'}</td>
                      <td className="p-4 font-medium text-white">{s.username}</td>
                      <td className="p-4">{s.asset}</td>
                      <td className="p-4">{s.timeframe}</td>
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
          )}

          {activeTab === 'codes' && (
            <div className="space-y-6">
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white mb-1">Generate Access Code</h3>
                  <p className="text-sm text-slate-400">Create a new single-use code for user registration.</p>
                </div>
                <div className="flex items-center gap-4">
                  {newCode && <span className="font-mono text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-lg text-lg tracking-widest">{newCode}</span>}
                  <button onClick={generateCode} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    Generate
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800 text-slate-400">
                    <tr>
                      <th className="p-4">Code</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Used By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {codes.map((c: any) => (
                      <tr key={c.id} className="hover:bg-slate-800/50">
                        <td className="p-4 font-mono text-white tracking-wider">{c.code}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs ${c.isUsed ? 'bg-slate-700 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {c.isUsed ? 'Used' : 'Available'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{c.usedByUsername || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'broadcast' && (
            <div className="max-w-2xl bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Send Broadcast Message</h3>
              <p className="text-slate-400 text-sm mb-6">
                Send a real-time notification to all connected users. Offline users will see this message the next time they log in.
              </p>
              <form onSubmit={handleBroadcast} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Message Content</label>
                  <textarea
                    value={broadcastMessage}
                    onChange={(e) => setBroadcastMessage(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-4 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors min-h-[120px]"
                    placeholder="e.g., Market alert: BTC/USD signal updated. Check your dashboard."
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendingBroadcast}
                  className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-5 h-5" />
                  {sendingBroadcast ? 'Sending...' : 'Send Broadcast'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 max-w-2xl">
              <h3 className="text-lg font-medium text-white mb-6">System Settings</h3>
              <div className="space-y-6">
                {settings.map((s: any) => (
                  <div key={s.key} className="space-y-2">
                    <label className="block text-sm font-medium text-slate-400 capitalize">
                      {s.key.replace(/_/g, ' ')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type={s.key.includes('key') ? 'password' : 'text'}
                        defaultValue={s.value}
                        id={`setting-${s.key}`}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg py-2 px-4 focus:outline-none focus:border-indigo-500 transition-colors text-white"
                        placeholder={s.key.includes('key') ? 'Enter API Key' : ''}
                      />
                      <button
                        onClick={() => {
                          const input = document.getElementById(`setting-${s.key}`) as HTMLInputElement;
                          updateSetting(s.key, input.value);
                        }}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
