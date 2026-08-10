/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Mail, Lock, LogIn, UserPlus, Ticket } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { UserProfile } from '../types/game';
import { auth } from '../firebase-client'; // Import client-side auth
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  getIdToken,
  User
} from 'firebase/auth';

const AVATARS = ['🎮', '🏆', '🔥', '👑', '🎲', '⚡', '🤖', '🦊', '🐯', '🐼', '🦁', '🦄'];

interface AuthScreenProps {
  onLoginSuccess: (profile: UserProfile, token: string) => void;
  initialError?: string | null;
}

export default function AuthScreen({ onLoginSuccess, initialError }: AuthScreenProps) {
  const API_BASE_URL = (() => {
    if (typeof window === 'undefined') return 'http://localhost:3002';
    const host = window.location.hostname;
    const configured = import.meta.env.VITE_APP_URL || '';
    if (host === 'localhost' || host === '127.0.0.1') {
      return window.location.origin || 'http://localhost:3000';
    }
    return configured || window.location.origin || 'http://localhost:3002';
  })();
  const { t } = useLanguage();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [avatar, setAvatar] = useState('🎮');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError || '');
  const [successMessage, setSuccessMessage] = useState('');

  const handleBackendLogin = async (firebaseUser: User) => {
    try {
      const token = await firebaseUser.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: isLogin ? undefined : username,
          email: firebaseUser.email,
          avatar: isLogin ? undefined : avatar,
          promoCode: isLogin ? undefined : promoCode,
        }),
      });

      const profileData = await response.json();

      if (!response.ok) {
        throw new Error(profileData.error || 'Failed to sync with server.');
      }
      
      onLoginSuccess(profileData, token);

    } catch (err: any) {
      setError(`Login to backend failed: ${err.message}`);
      // If backend login fails, we should probably sign the user out of Firebase Auth too
      // to avoid a disjointed state.
      await auth.signOut();
      throw err; // re-throw to be caught by the main handleSubmit
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError(t('emailPasswordRequired'));
      return;
    }
    if (!isLogin && !username.trim()) {
      setError(t('nameRequired'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (isLogin) {
        // Handle Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await handleBackendLogin(userCredential.user);

      } else {
        // Handle Registration
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        setSuccessMessage('Registration successful! Logging you in...');
        // After creating the user, we immediately log them into our backend
        await handleBackendLogin(userCredential.user);
      }
    } catch (err: any) {
      // Firebase provides detailed error messages
      if (err.code) {
        switch (err.code) {
          case 'auth/user-not-found':
            setError('No account found with this email.');
            break;
          case 'auth/wrong-password':
            setError('Incorrect password. Please try again.');
            break;
          case 'auth/email-already-in-use':
            setError('This email is already registered. Please sign in.');
            break;
          case 'auth/weak-password':
            setError('Password is too weak. Must be at least 6 characters.');
            break;
          default:
            setError(`Authentication failed: ${err.message}`);
            break;
        }
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col items-center justify-center p-4 selection:bg-purple-500 selection:text-white relative overflow-hidden">
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/10 animate-pulse" />
        <div className="absolute w-[800px] h-[800px] rounded-full border border-purple-500/5" />
      </div>

      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-blue-500/5 space-y-6 relative z-10">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 bg-gradient-to-tr from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-widest bg-gradient-to-r from-yellow-400 via-white to-purple-400 bg-clip-text text-transparent">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-xs font-black text-purple-400 uppercase tracking-widest">
            {t('gameSubtitle')}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm text-center font-medium">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-3 rounded-lg text-sm text-center font-medium">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t('chooseAvatar')}
                </label>
                <div className="grid grid-cols-6 gap-2 bg-black/40 p-2 rounded-xl border border-white/5">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setAvatar(av)}
                      className={`text-xl p-2 rounded-lg transition-all ${
                        avatar === av 
                          ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 scale-110 shadow-lg shadow-blue-500/30 border border-white/20' 
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {t('displayName')}
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('displayNamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>
            </>
          )}

          <div className="space-y-1">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Mail className="w-3 h-3 text-slate-500" /> {t('emailAddress')}
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/30 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
          </div>

          <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-500" /> Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/30 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
          
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Ticket className="w-3 h-3 text-slate-500" /> Promo Code (Optional)
              </label>
              <input
                type="text"
                placeholder="AGENTPROMO123"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="w-full bg-black/30 border border-white/10 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 uppercase tracking-wider cursor-pointer"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {isLogin ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {isLogin ? 'Sign In' : 'Sign Up'}
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-slate-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="font-bold text-blue-400 hover:text-blue-300 underline"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}
