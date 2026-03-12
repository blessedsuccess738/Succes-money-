import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';

export default function Callback() {
  const [pocketOptionId, setPocketOptionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          
          if (userData?.role === 'admin') {
            navigate('/admin');
            return;
          }
          
          // Check if user has an access code
          const qCode = query(collection(db, 'access_codes'), where('usedBy', '==', user.uid));
          const codeSnap = await getDocs(qCode);
          const hasAccessCode = !codeSnap.empty;

          if (userData?.pocketOptionId && hasAccessCode) {
            navigate('/dashboard');
          } else if (userData?.pocketOptionId) {
            navigate('/verify-code');
          } else {
            setAuthLoading(false);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users/' + user.uid);
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

    if (!pocketOptionId.trim()) {
      setError('Pocket Option ID is required');
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Not authenticated');

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          pocketOptionId: pocketOptionId.trim()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'users/' + user.uid);
      }

      const qCode = query(collection(db, 'access_codes'), where('usedBy', '==', user.uid));
      const codeSnap = await getDocs(qCode);
      if (!codeSnap.empty) {
        navigate('/dashboard');
      } else {
        navigate('/verify-code');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to link account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-2 text-center">Connection Successful</h1>
        <p className="text-slate-400 mb-8 text-center">
          You have successfully returned from Pocket Option. Please enter your Pocket Option ID below to verify and link your account.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-center gap-3 text-red-500">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Pocket Option ID
            </label>
            <input
              type="text"
              value={pocketOptionId}
              onChange={(e) => setPocketOptionId(e.target.value)}
              placeholder="e.g. 12345678"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              required
            />
            <p className="text-xs text-slate-500 mt-2">
              You can find your ID in your Pocket Option profile settings.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Verifying...' : 'Verify & Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
