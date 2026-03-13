import { useNavigate } from 'react-router-dom';
import { TrendingUp, ShieldCheck, Zap, Mail, MessageCircle } from 'lucide-react';
import FloatingSupport from '../../components/FloatingSupport';

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/20 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Header */}
      <header className="p-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-emerald-400 w-8 h-8" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Signal<span className="text-emerald-400">Bot</span></h1>
        </div>
        <button 
          onClick={() => navigate('/login')}
          className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
        >
          Sign In
        </button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Market Connection Active
        </div>

        <h2 className="text-5xl md:text-7xl font-black text-white tracking-tight mb-6 max-w-4xl leading-tight">
          Trade Smarter with <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-500">
            Institutional Precision
          </span>
        </h2>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mb-12">
          Connect your Pocket Option account securely and get real-time, high-probability signals delivered directly to your dashboard.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md justify-center">
          <button 
            onClick={() => navigate('/signup')}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 text-lg"
          >
            <Zap className="w-5 h-5" />
            Get Started Now
          </button>
          <button 
            onClick={() => navigate('/login')}
            className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-2 text-lg"
          >
            <Mail className="w-5 h-5" />
            Login with Email
          </button>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-24 max-w-5xl w-full text-left">
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Secure Connection</h3>
            <p className="text-slate-400">Your account is linked via encrypted session tokens. We never store your actual password.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl">
            <TrendingUp className="w-10 h-10 text-emerald-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Live Sync</h3>
            <p className="text-slate-400">Watch your balance and market movements update in real-time directly on your dashboard.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/50 p-6 rounded-2xl">
            <MessageCircle className="w-10 h-10 text-emerald-400 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">24/7 VIP Support</h3>
            <p className="text-slate-400">Get direct access to our admins and community channels for instant help and access codes.</p>
          </div>
        </div>
      </main>

      <FloatingSupport />
    </div>
  );
}
