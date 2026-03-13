import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, AlertCircle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function VerifyCode() {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!user) throw new Error('User not authenticated');
      if (!user.pocketOptionId) throw new Error('Please connect your Pocket Option account first');

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
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Verify code error:', err);
      setError(err.message || 'Failed to verify access code');
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
          <h2 className="text-2xl font-bold text-white mb-2">Access Code Required</h2>
          <p className="text-slate-400 text-sm mb-4">
            Please enter your valid access code to enter the dashboard.
          </p>
          {user && (
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

        {user?.hasAccessCode ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center mb-8">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Access Verified</h3>
            <p className="text-slate-400 text-sm">
              Your access code has been verified. Please connect your Pocket Option account below to continue to the dashboard.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
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

        <div className="mt-8 pt-6 border-t border-slate-800">
          <h3 className="text-lg font-medium text-white mb-4 text-center">Trading Account</h3>
          {user?.pocketOptionId ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Pocket Option Connected</span>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm text-slate-400 mb-4">
                You must connect your Pocket Option account to access the dashboard.
              </p>
              <button
                onClick={() => {
                  const callbackUrl = encodeURIComponent(`${window.location.origin}/callback`);
                  window.location.href = `https://pocketoption.com/register?utm_source=signal_bot&redirect_url=${callbackUrl}`;
                }}
                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-5 h-5" />
                Connect Pocket Option
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
