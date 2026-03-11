import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Users, Activity, Key, Settings, LogOut, ExternalLink, MessageSquare } from 'lucide-react';
import Notifications from '../../components/Notifications';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('browser');
  const [users, setUsers] = useState([]);
  const [signals, setSignals] = useState([]);
  const [codes, setCodes] = useState([]);
  const [settings, setSettings] = useState([]);
  const [newCode, setNewCode] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user || data.user.role !== 'admin') {
          navigate('/meta');
        } else {
          fetchData();
        }
      })
      .catch(() => navigate('/meta'));
  }, [activeTab, navigate]);

  const fetchData = async () => {
    try {
      if (activeTab === 'users') {
        const res = await fetch('/api/admin/users');
        setUsers(await res.json());
      } else if (activeTab === 'signals') {
        const res = await fetch('/api/admin/signals');
        setSignals(await res.json());
      } else if (activeTab === 'codes') {
        const res = await fetch('/api/admin/codes');
        setCodes(await res.json());
      } else if (activeTab === 'settings') {
        const res = await fetch('/api/admin/settings');
        setSettings(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateCode = async () => {
    const res = await fetch('/api/admin/codes/generate', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setNewCode(data.code);
      fetchData();
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    navigate('/meta');
  };

  const handleBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    
    setSendingBroadcast(true);
    try {
      await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMessage })
      });
      setBroadcastMessage('');
      alert('Broadcast message sent successfully!');
    } catch (err) {
      alert('Failed to send broadcast');
    }
    setSendingBroadcast(false);
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
                      <td className="p-4 font-mono text-emerald-400">{u.pocket_option_id || 'Not Linked'}</td>
                      <td className="p-4 font-mono text-slate-400">{u.ip_address || 'N/A'}</td>
                      <td className="p-4 text-slate-400">{new Date(u.created_at).toLocaleString()}</td>
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
                      <td className="p-4 text-slate-400">{new Date(s.created_at).toLocaleString()}</td>
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
                          <span className={`px-2 py-1 rounded text-xs ${c.is_used ? 'bg-slate-700 text-slate-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {c.is_used ? 'Used' : 'Available'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{c.used_by_username || '-'}</td>
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
              <div className="space-y-4">
                {settings.map((s: any) => (
                  <div key={s.key}>
                    <label className="block text-sm font-medium text-slate-400 mb-1 capitalize">{s.key.replace('_', ' ')}</label>
                    <input
                      type="text"
                      defaultValue={s.value}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2 px-4 focus:outline-none focus:border-indigo-500 transition-colors text-white"
                      readOnly
                    />
                  </div>
                ))}
                <p className="text-sm text-slate-500 mt-4">Settings are currently read-only in this demo.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
