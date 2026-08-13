/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sparkles, Mail, Lock, LogIn, UserPlus, Ticket, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { UserProfile } from '../types/game';
import { auth } from '../firebase-client'; // Import client-side auth
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';

const AVATARS = ['🎮', '🏆', '🔥', '👑', '🎲', '⚡', '🤖', '🦊', '🐯', '🐼', '🦁', '🦄'];

interface AuthScreenProps {
  onLoginSuccess: (profile: UserProfile, token: string) => void;
  initialError?: string | null;
}

export default function AuthScreen({ onLoginSuccess, initialError }: AuthScreenProps) {
  const API_BASE_URL = (() => {
    if (typeof window === 'undefined') {
      // Server-side rendering
      return 'http://localhost:3002';
    }
    // In browser, use relative paths so requests hit the current hosting origin directly
    return '';
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
  const [verificationPending, setVerificationPending] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpUser, setOtpUser] = useState<User | null>(null);
  const [googleOnboarding, setGoogleOnboarding] = useState(false);
  const [promoStep, setPromoStep] = useState(false);

  const readApiJson = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Server-ku API JSON ma soo celin (${response.status}). Hubi backend deployment-ka iyo routing-ka.`);
    }
    return response.json();
  };

  const handleBackendLogin = async (firebaseUser: User, onboardingComplete = false) => {
    try {
      const token = await firebaseUser.getIdToken();
      const pendingKey = `ludosom_pending_signup_${firebaseUser.email?.trim().toLowerCase() || firebaseUser.uid}`;
      let pendingSignup: { username?: string; avatar?: string; promoCode?: string } | null = null;
      try {
        const rawPending = localStorage.getItem(pendingKey);
        pendingSignup = rawPending ? JSON.parse(rawPending) : null;
      } catch { /* ignore invalid local signup state */ }
      
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: pendingSignup?.username || (onboardingComplete ? firebaseUser.displayName || undefined : (isLogin ? undefined : username)),
          email: firebaseUser.email,
          avatar: pendingSignup?.avatar || (onboardingComplete ? firebaseUser.photoURL || undefined : (isLogin ? undefined : avatar)),
          // Keep the entered promo code on a retry/login too. Firebase Auth may
          // have created the account even when the first backend sync failed.
          promoCode: pendingSignup?.promoCode || promoCode.trim() || undefined,
          onboardingComplete,
        }),
      });

      const profileData = await readApiJson(response);

      if (!response.ok) {
        throw new Error(profileData.error || 'Failed to sync with server.');
      }
      localStorage.removeItem(pendingKey);
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
        await userCredential.user.reload();
        if (!userCredential.user.emailVerified) {
          const token = await userCredential.user.getIdToken();
          const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          const otpData = await readApiJson(otpResponse);
          if (!otpResponse.ok && otpResponse.status !== 429) throw new Error(otpData.error || 'OTP could not be sent.');
          setOtpUser(userCredential.user);
          setVerificationPending(true);
          setSuccessMessage(otpResponse.ok ? '6-digit OTP ayaa loo diray email-kaaga.' : otpData.error);
          return;
        }
        await handleBackendLogin(userCredential.user);

      } else {
        // Handle Registration
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const pendingKey = `ludosom_pending_signup_${userCredential.user.email?.trim().toLowerCase() || userCredential.user.uid}`;
        localStorage.setItem(pendingKey, JSON.stringify({ username: username.trim(), avatar, promoCode: promoCode.trim().toUpperCase() || undefined }));
        const token = await userCredential.user.getIdToken();
        const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const otpData = await readApiJson(otpResponse);
        if (!otpResponse.ok) throw new Error(otpData.error || 'OTP could not be sent.');
        setOtpUser(userCredential.user);
        setVerificationPending(true);
        setSuccessMessage('Account-ka waa la sameeyay. 6-digit OTP ayaa loo diray email-kaaga.');
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpUser || !/^\d{6}$/.test(otp)) return setError('Geli 6-da lambar ee OTP-ga.');
    setLoading(true); setError('');
    try {
      const token = await otpUser.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/otp/verify`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }) });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'OTP verification failed.');
      await otpUser.reload();
      await otpUser.getIdToken(true);
      if (googleOnboarding) {
        setVerificationPending(false);
        setPromoStep(true);
        setSuccessMessage('Email-ka waa la xaqiijiyay. Hadda geli promo code ama Skip dooro.');
      } else {
        await handleBackendLogin(otpUser);
      }
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (!otpUser) return;
    setLoading(true); setError('');
    try {
      const token = await otpUser.getIdToken();
      const response = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await readApiJson(response);
      if (!response.ok) throw new Error(data.error || 'OTP could not be resent.');
      setSuccessMessage('OTP cusub ayaa loo diray email-kaaga.');
    } catch (err:any) { setError(err.message); } finally { setLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(auth, provider);
      const token = await credential.user.getIdToken();
      const statusResponse = await fetch(`${API_BASE_URL}/api/auth/profile-status`, { headers: { Authorization: `Bearer ${token}` } });
      const status = await readApiJson(statusResponse);
      if (!statusResponse.ok) throw new Error(status.error || 'Could not check account status.');
      if (status.exists) {
        await handleBackendLogin(credential.user);
      } else {
        const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const otpData = await readApiJson(otpResponse);
        if (!otpResponse.ok && otpResponse.status !== 429) throw new Error(otpData.error || 'OTP could not be sent.');
        setOtpUser(credential.user);
        setGoogleOnboarding(true);
        setVerificationPending(true);
        setSuccessMessage(otpResponse.ok ? '6-digit OTP ayaa loo diray Gmail-kaaga.' : otpData.error);
      }
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') setError(err?.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const finishGoogleOnboarding = async () => {
    if (!otpUser) return;
    setLoading(true); setError('');
    try {
      await handleBackendLogin(otpUser, true);
    } catch (err:any) { setError(err.message); } finally { setLoading(false); }
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

        {promoStep ? (
          <div className="space-y-4">
            <div className="text-center"><h2 className="text-xl font-black">Promo Code</h2><p className="mt-2 text-xs leading-relaxed text-slate-400">Haddii aad agent ka heshay promo code, hadda geli. Haddii aadan haysan waad ka boodi kartaa.</p></div>
            <div className="space-y-1"><label className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400"><Ticket className="h-3 w-3" /> Promo Code (Optional)</label><input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="AGENTPROMO123" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-blue-400" /></div>
            <button type="button" onClick={finishGoogleOnboarding} disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 py-3.5 text-sm font-black disabled:opacity-50">{loading ? 'Creating account...' : promoCode.trim() ? 'Continue with Promo Code' : 'Skip & Continue'}</button>
            <p className="text-center text-[10px] text-slate-500">Marka account-ku agent ku xirmo, agent kale looma beddeli karo si caadi ah.</p>
          </div>
        ) : verificationPending ? (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="text-center"><h2 className="text-xl font-black">Verify Your Email</h2><p className="mt-2 text-xs text-slate-400">Geli 6-digit code-ka loo diray {otpUser?.email}</p></div>
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" className="w-full rounded-xl border border-purple-400/40 bg-black/30 px-4 py-4 text-center text-3xl font-black tracking-[0.5em] text-white outline-none focus:border-purple-300" />
            <button disabled={loading || otp.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 py-3.5 text-sm font-black disabled:opacity-50">{loading ? 'Verifying...' : 'Verify OTP'}</button>
            <button type="button" onClick={handleResendOtp} disabled={loading} className="w-full text-xs font-bold text-blue-300 hover:text-blue-200">Resend OTP</button>
          </form>
        ) : <form onSubmit={handleSubmit} className="space-y-4">
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
        </form>}

        <div className="flex items-center gap-3"><div className="h-px flex-1 bg-white/10" /><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">or</span><div className="h-px flex-1 bg-white/10" /></div>
        <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50">
          <span className="text-lg font-black text-blue-600">G</span> Continue with Google
        </button>

        {verificationPending && <p className="flex items-center justify-center gap-2 text-center text-[11px] text-emerald-300"><RefreshCw className="h-3.5 w-3.5" /> Hubi Inbox iyo Spam/Junk folder-ka.</p>}

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
