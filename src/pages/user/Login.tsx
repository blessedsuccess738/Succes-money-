import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, User } from 'lucide-react';
import { auth, db } from '../../firebase';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';

export default function UserLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let email = username.includes('@') ? username : `${username}@signalbot.com`;
      if (username.toLowerCase() === 'blessedsuccess738' || username.toLowerCase() === 'blessedsuccess738@gmail.com') {
        email = 'blessedsuccess738@gmail.com';
      }
      
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      } catch (signInErr: any) {
        if ((signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') && email.toLowerCase() === 'blessedsuccess738@gmail.com' && password === 'Blessed2007@') {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            const { setDoc, serverTimestamp } = await import('firebase/firestore');
            userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              username: 'Admin',
              email: email,
              role: 'admin',
              createdAt: serverTimestamp(),
              ipAddress: 'unknown'
            });
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              throw new Error('This account is linked to Google. Please use the "Continue with Google" button below.');
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }
      
      const user = userCredential.user;

      // Get user profile
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.data();

      if (!userData) {
        throw new Error('User profile not found');
      }

      if (userData.role === 'admin') {
        navigate('/admin');
      } else {
        // Check if user has used an access code
        const q = query(collection(db, 'access_codes'), where('usedBy', '==', user.uid));
        const codeSnap = await getDocs(q);
        const hasAccessCode = !codeSnap.empty;

        if (userData.pocketOptionId && hasAccessCode) {
          navigate('/dashboard');
        } else {
          navigate('/verify-code');
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid username or password');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      let userData;

      if (!userDoc.exists()) {
        const email = user.email || '';
        const role = email.toLowerCase() === 'blessedsuccess738@gmail.com' ? 'admin' : 'user';
        const shortId = Math.floor(100000 + Math.random() * 900000).toString();

        userData = {
          username: user.displayName || email.split('@')[0],
          email: email,
          shortId: shortId,
          role: role,
          createdAt: serverTimestamp(),
          ipAddress: 'unknown'
        };

        await setDoc(userDocRef, userData);
      } else {
        userData = userDoc.data();
      }

      if (userData.role === 'admin') {
        navigate('/admin');
      } else {
        const q = query(collection(db, 'access_codes'), where('usedBy', '==', user.uid));
        const codeSnap = await getDocs(q);
        const hasAccessCode = !codeSnap.empty;

        if (userData.pocketOptionId && hasAccessCode) {
          navigate('/dashboard');
        } else {
          navigate('/verify-code');
        }
      }
    } catch (err: any) {
      console.error('Google Auth error:', err);
      setError(err.message || 'Google authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md">
        <h2 className="text-3xl font-bold mb-6 text-center text-emerald-400">Trade Signal Bot</h2>
        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-emerald-500 transition-colors"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:border-emerald-500 transition-colors"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
          <span className="border-b border-slate-700 w-1/5 lg:w-1/4"></span>
          <span className="text-xs text-center text-slate-500 uppercase">Or continue with</span>
          <span className="border-b border-slate-700 w-1/5 lg:w-1/4"></span>
        </div>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="mt-4 w-full bg-white/5 hover:bg-white/10 active:scale-95 active:bg-white/20 backdrop-blur-md text-white font-medium py-2.5 rounded-xl border border-white/10 shadow-lg transition-all duration-200 flex items-center justify-center disabled:opacity-50"
        >
          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-slate-400">
          Don't have an account? <Link to="/signup" className="text-emerald-400 hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
