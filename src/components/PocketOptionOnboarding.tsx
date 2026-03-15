import React, { useState, useEffect } from 'react';
import { CheckCircle2, ChevronRight, ExternalLink, Loader2, ShieldCheck, User, Key } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { io } from 'socket.io-client';

const socket = io();

interface PocketOptionOnboardingProps {
  user: any;
  onComplete: (pocketId: string) => void;
}

export default function PocketOptionOnboarding({ user, onComplete }: PocketOptionOnboardingProps) {
  const [step, setStep] = useState(1);
  const [pocketId, setPocketId] = useState('');
  const [pocketEmail, setPocketEmail] = useState('');
  const [pocketPassword, setPocketPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [affiliateLink, setAffiliateLink] = useState('https://pocketoption.com/register');
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');

  useEffect(() => {
    fetch('/api/public/settings')
      .then(res => res.json())
      .then(data => {
        if (data.pocket_option_affiliate_link) {
          setAffiliateLink(data.pocket_option_affiliate_link);
        }
      })
      .catch(console.error);

    // Listen for 2FA requirement
    socket.on('require_2fa', (data) => {
      if (data.userId === user.uid) {
        setShow2FA(true);
        setLoading(false);
      }
    });

    return () => {
      socket.off('require_2fa');
    };
  }, [user.uid]);

  const handleSubmit2FA = () => {
    if (twoFACode.length >= 4) {
      socket.emit('submit_2fa', { userId: user.uid, code: twoFACode });
      setShow2FA(false);
      setLoading(true);
    }
  };

  const handleCreateAccount = () => {
    // Open Pocket Option in a built-in browser (iframe modal)
    setStep(1.5); // Intermediate step to show the iframe
  };

  const handleLinkAccount = async () => {
    if (!pocketId || pocketId.length < 5) {
      setError('Please enter a valid Pocket Option ID');
      return;
    }
    if (!pocketEmail || !pocketEmail.includes('@')) {
      setError('Please enter a valid Pocket Option email');
      return;
    }
    if (!pocketPassword || pocketPassword.length < 6) {
      setError('Please enter your Pocket Option password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 3: Analyze everything (simulate connection)
      setStep(3);
      
      // Simulate analysis delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Call backend to securely store encrypted credentials
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/pocket-option', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pocketOptionId: pocketId,
          pocketOptionEmail: pocketEmail,
          pocketOptionPassword: pocketPassword
        })
      });

      if (!response.ok) {
        throw new Error('Failed to securely link account');
      }

      onComplete(pocketId);
    } catch (err: any) {
      console.error('Failed to link account:', err);
      setError('Failed to link account. Please try again.');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 w-full max-w-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Connect Trading Account</h2>
              <p className="text-sm text-slate-400">Complete setup to activate auto-trading</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
            <div className={`w-8 h-1 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
            <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
            <div className={`w-8 h-1 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
            <div className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 flex flex-col justify-center min-h-[400px] relative">
          
          {show2FA && (
            <div className="absolute inset-0 z-10 bg-slate-800 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
              <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mb-6 border border-amber-500/30">
                <Key className="w-10 h-10 text-amber-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Verification Required</h3>
              <p className="text-slate-400 mb-6 max-w-xs">
                Pocket Option has sent a verification code to your email. Please enter it below to continue.
              </p>
              <div className="w-full max-w-xs space-y-4">
                <input
                  type="text"
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl py-4 px-4 text-center text-2xl font-mono tracking-[0.5em] focus:outline-none focus:border-emerald-500 transition-colors text-white"
                  maxLength={6}
                />
                <button
                  onClick={handleSubmit2FA}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                >
                  Verify & Continue
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-24 h-24 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto border border-indigo-500/30">
                <ExternalLink className="w-10 h-10 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Step 1: Create Account</h3>
                <p className="text-slate-400 max-w-md mx-auto">
                  To use the signal bot, you must create a new Pocket Option account through our secure integrated browser.
                </p>
              </div>
              
              <button
                onClick={handleCreateAccount}
                disabled={loading}
                className="w-full max-w-sm mx-auto bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 text-lg"
              >
                Open Built-in Browser
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {step === 1.5 && (
            <div className="animate-in fade-in zoom-in duration-300 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Pocket Option Registration</h3>
                <button 
                  onClick={() => setStep(2)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  I Have Registered &rarr;
                </button>
              </div>
              <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 overflow-hidden relative min-h-[400px]">
                {/* Note: Pocket Option may block iframe embedding via X-Frame-Options. 
                    If it shows a blank screen, the user will need to use the fallback button. */}
                <iframe 
                  src={affiliateLink} 
                  className="w-full h-full border-0 absolute inset-0"
                  title="Pocket Option Registration"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">
                If the browser above is blank (due to security restrictions), please <a href={affiliateLink} target="_blank" rel="noreferrer" className="text-indigo-400 underline">click here to open in a new tab</a>, then click "I Have Registered".
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-right duration-300">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <User className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Step 2: Link Account</h3>
                <p className="text-slate-400 max-w-md mx-auto text-sm">
                  Account created successfully! To enable Auto-Trading, the bot needs to connect to your account. Your credentials are encrypted and only used by the trading robot.
                </p>
              </div>
              
              <div className="max-w-sm mx-auto w-full space-y-4 text-left">
                {error && <div className="text-rose-400 text-sm bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 text-center">{error}</div>}
                
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Pocket Option ID</label>
                  <input
                    type="text"
                    value={pocketId}
                    onChange={(e) => setPocketId(e.target.value)}
                    placeholder="e.g., 12345678"
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 px-4 font-mono focus:outline-none focus:border-emerald-500 transition-colors text-white placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Pocket Option Email</label>
                  <input
                    type="email"
                    value={pocketEmail}
                    onChange={(e) => setPocketEmail(e.target.value)}
                    placeholder="Email used for Pocket Option"
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-white placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Pocket Option Password</label>
                  <input
                    type="password"
                    value={pocketPassword}
                    onChange={(e) => setPocketPassword(e.target.value)}
                    placeholder="Password used for Pocket Option"
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-colors text-white placeholder:text-slate-600"
                  />
                </div>
                
                <button
                  onClick={handleLinkAccount}
                  disabled={!pocketId || !pocketEmail || !pocketPassword || loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 text-lg mt-2"
                >
                  Securely Link Account
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
              <div className="w-32 h-32 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 relative">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin"></div>
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Step 3: Analyzing Connection</h3>
                <p className="text-slate-400 max-w-md mx-auto">
                  Please wait while the bot analyzes your account and establishes a secure connection for auto-trading.
                </p>
              </div>
              <div className="max-w-sm mx-auto w-full">
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-full animate-pulse"></div>
                </div>
                <p className="text-sm text-emerald-400 mt-4 font-mono uppercase tracking-widest">
                  Establishing secure link...
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
