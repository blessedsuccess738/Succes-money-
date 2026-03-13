import React, { useState } from 'react';
import { X, Save, AlertCircle, CheckCircle2, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface AutoTradeSettingsProps {
  user: any;
  onClose: () => void;
  onSave: (settings: any) => void;
}

export default function AutoTradeSettings({ user, onClose, onSave }: AutoTradeSettingsProps) {
  const [tradeAmount, setTradeAmount] = useState(user.tradeSettings?.tradeAmount || 10);
  const [takeProfit, setTakeProfit] = useState(user.tradeSettings?.takeProfit || 100);
  const [stopLoss, setStopLoss] = useState(user.tradeSettings?.stopLoss || 50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (tradeAmount <= 0 || takeProfit <= 0 || stopLoss <= 0) {
      setError('All values must be greater than 0');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const token = await auth.currentUser?.getIdToken();
      
      // Save to SQLite backend
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ auto_trade_amount: Number(tradeAmount) })
      });

      if (!res.ok) throw new Error('Failed to save backend settings');

      // Save to Firestore for other settings
      const settings = {
        tradeAmount: Number(tradeAmount),
        takeProfit: Number(takeProfit),
        stopLoss: Number(stopLoss),
      };

      await updateDoc(doc(db, 'users', user.uid), {
        tradeSettings: settings
      });

      setSuccess(true);
      onSave(settings);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Auto-Trade Settings
          </h2>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl flex items-center gap-2 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              Settings saved successfully!
            </div>
          )}

          <div className="space-y-4">
            {/* Trade Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-slate-400" />
                Base Trade Amount
              </label>
              <p className="text-xs text-slate-500 mb-2">The amount placed on each individual trade.</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  min="1"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 pl-8 pr-4 focus:outline-none focus:border-emerald-500 transition-colors text-white font-mono text-lg"
                />
              </div>
            </div>

            {/* Take Profit */}
            <div className="pt-2">
              <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Take Profit (Daily Goal)
              </label>
              <p className="text-xs text-slate-500 mb-2">Bot stops automatically when you reach this profit.</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 font-bold">+$</span>
                <input
                  type="number"
                  min="1"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-emerald-500 transition-colors text-emerald-400 font-mono text-lg"
                />
              </div>
            </div>

            {/* Stop Loss */}
            <div className="pt-2">
              <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                Stop Loss (Daily Limit)
              </label>
              <p className="text-xs text-slate-500 mb-2">Bot stops automatically if losses reach this amount.</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-400 font-bold">-$</span>
                <input
                  type="number"
                  min="1"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-xl py-3 pl-10 pr-4 focus:outline-none focus:border-rose-500 transition-colors text-rose-400 font-mono text-lg"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={handleSave}
            disabled={loading || success}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : success ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Settings
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
