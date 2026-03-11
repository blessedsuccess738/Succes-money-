import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, ShieldCheck } from 'lucide-react';

export default function ConnectBroker() {
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (!data.user) {
          navigate('/login');
        } else if (data.user.role === 'admin') {
          navigate('/admin');
        } else if (!data.user.hasAccessCode) {
          navigate('/verify-code');
        } else if (data.user.pocketOptionId) {
          navigate('/dashboard');
        }
      })
      .catch(() => navigate('/login'));
  }, [navigate]);

  const handleConnect = () => {
    // Redirect to Pocket Option with callback URL
    const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
    window.location.href = `https://pocketoption.com/register?utm_source=signal_bot&redirect_url=${callbackUrl}`;
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 text-center">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-8 h-8 text-indigo-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-4">Connect Trading Account</h1>
        <p className="text-slate-400 mb-8">
          To use the real-time signal dashboard, you must first link your Pocket Option account. 
          Click the button below to sign up or log in securely.
        </p>

        <button
          onClick={handleConnect}
          className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-5 h-5" />
          Connect Pocket Option
        </button>

        <p className="text-xs text-slate-500 mt-6">
          You will be redirected back to this platform automatically after connecting.
        </p>
      </div>
    </div>
  );
}
