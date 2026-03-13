import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, AlertCircle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function VerifyCode() {
  const [accessCode, setAccessCode] = useState('');
  const [pocketOptionId, setPocketOptionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState(1); // 1: Connect, 2: Countdown, 3: Code, 4: PO ID
  const [countdown, setCountdown] = useState(30);
  const navigate = useNavigate();

  useEffect(() => {
    let timer: any;
    if (step === 2 && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    } else if (step === 2 && countdown === 0) {
      setStep(3);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const userData = userDoc.data();
          
          if (userData) {
            if (userData.role === 'admin') {
              navigate('/admin');
            } else {
              // Check if user already has access
              const q = query(collection(db, 'access_codes'), where('usedBy', '==', firebaseUser.uid));
              const codeSnap = await getDocs(q);
              if (!codeSnap.empty && userData.pocketOptionId) {
                navigate('/dashboard');
              } else {
                setUser({ ...userData, uid: firebaseUser.uid, hasAccessCode: !codeSnap.empty || userData.hasAccessCode });
                if (!codeSnap.empty && !userData.pocketOptionId) {
                  setStep(4);
                } else if (!codeSnap.empty && userData.pocketOptionId) {
                   navigate('/dashboard');
                }
              }
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + firebaseUser.uid);
        }
      } else {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleConnect = () => {
    setStep(2);
  };

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!user) throw new Error('User not authenticated');

      // Find the access code
      const q = query(collection(db, 'access_codes'), where('code', '==', accessCode.toUpperCase()), where('isUsed', '==', false));
      let codeSnap;
      try {
        codeSnap = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'access_codes');
        return;
      }

      if (codeSnap.empty) {
        throw new Error('Invalid or already used access code');
      }

      const codeDoc = codeSnap.docs[0];
      
      // Update the code
      try {
        await updateDoc(doc(db, 'access_codes', codeDoc.id), {
          isUsed: true,
          usedBy: user.uid,
          usedByUsername: user.username || user.email || 'Unknown',
          usedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'access_codes/' + codeDoc.id);
      }

      // Update user profile
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          hasAccessCode: true
        });
        setUser((prev: any) => ({ ...prev, hasAccessCode: true }));
        setStep(4);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
      }
    } catch (err: any) {
      console.error('Verify code error:', err);
      setError(err.message || 'Failed to verify access code');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePoId = async (e: FormEvent) => {
    e.preventDefault();
    if (!pocketOptionId) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        pocketOptionId: pocketOptionId
      });
      navigate('/dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
            <Key className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {step === 1 && "Connect Trading Account"}
            {step === 2 && "Connecting..."}
            {step === 3 && "Verify Access Code"}
            {step === 4 && "Final Step"}
          </h2>
          <p className="text-slate-400 text-sm mb-4">
            {step === 1 && "Start by connecting your Pocket Option account."}
            {step === 2 && "Please wait while we establish a secure connection."}
            {step === 3 && "Enter your access code to unlock the dashboard."}
            {step === 4 && "Enter your Pocket Option ID to complete setup."}
          </p>
          {user && step === 3 && (
            <div className="bg-slate-800/50 border border-slate-700 p-4 rounded-xl inline-block">
              <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Your System ID</p>
              <p className="text-xl font-mono text-emerald-400 font-bold">{user.shortId || user.uid.substring(0, 6).toUpperCase()}</p>
              <p className="text-xs text-slate-500 mt-2">Provide this ID to the admin to receive your access code.</p>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {step === 1 && (
          <button
            onClick={handleConnect}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <ExternalLink className="w-5 h-5" />
            Connect Pocket Option
          </button>
        )}

        {step === 2 && (
          <div className="text-center py-8">
            <div className="text-5xl font-bold text-emerald-400 mb-4 font-mono">{countdown}s</div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-1000 ease-linear"
                style={{ width: `${((30 - countdown) / 30) * 100}%` }}
              ></div>
            </div>
            <p className="text-slate-500 text-xs mt-4 animate-pulse">Establishing secure handshake...</p>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={handleVerifyCode} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Access Code
              </label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono uppercase tracking-wider"
                placeholder="ENTER CODE"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !accessCode}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify Code'
              )}
            </button>
          </form>
        )}

        {step === 4 && (
          <form onSubmit={handleSavePoId} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Pocket Option ID
              </label>
              <input
                type="text"
                value={pocketOptionId}
                onChange={(e) => setPocketOptionId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                placeholder="Enter your PO ID"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || !pocketOptionId}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Enter Dashboard'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
