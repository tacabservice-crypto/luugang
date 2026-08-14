/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Mail, Lock, LogIn, UserPlus, Ticket, RefreshCw, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import LanguageToggle from './LanguageToggle';
import { UserProfile } from '../types/game';
import { auth } from '../firebase-client'; // Import client-side auth
import { userErrorMessage } from '../utils/userError';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';

const AVATARS = ['/ludosom-logo.png', '🎮', '🏆', '🔥', '👑', '🎲', '⚡', '🤖', '🦊', '🐯', '🐼', '🦁', '🦄'];

const COUNTRY_CALLING_CODES: Record<string, string> = {
  SO: '+252', KE: '+254', ET: '+251', DJ: '+253', UG: '+256', TZ: '+255', RW: '+250',
  GB: '+44', US: '+1', CA: '+1', SE: '+46', NO: '+47', DK: '+45', FI: '+358', DE: '+49',
  NL: '+31', BE: '+32', FR: '+33', IT: '+39', ES: '+34', CH: '+41', AT: '+43', IE: '+353',
  AE: '+971', SA: '+966', QA: '+974', OM: '+968', KW: '+965', BH: '+973', TR: '+90',
  IN: '+91', PK: '+92', BD: '+880', CN: '+86', JP: '+81', AU: '+61', NZ: '+64', ZA: '+27',
};

const COUNTRY_OPTIONS = [
  ['SO', 'Somalia'], ['KE', 'Kenya'], ['ET', 'Ethiopia'], ['DJ', 'Djibouti'], ['UG', 'Uganda'],
  ['TZ', 'Tanzania'], ['RW', 'Rwanda'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['CA', 'Canada'], ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'],
  ['DE', 'Germany'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['FR', 'France'], ['IT', 'Italy'],
  ['ES', 'Spain'], ['CH', 'Switzerland'], ['AT', 'Austria'], ['IE', 'Ireland'], ['AE', 'UAE'],
  ['SA', 'Saudi Arabia'], ['QA', 'Qatar'], ['OM', 'Oman'], ['KW', 'Kuwait'], ['BH', 'Bahrain'],
  ['TR', 'Turkey'], ['IN', 'India'], ['PK', 'Pakistan'], ['BD', 'Bangladesh'], ['CN', 'China'],
  ['JP', 'Japan'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['ZA', 'South Africa'],
] as const;

const SOMALI_MOBILE_PREFIXES = ['61', '62', '63', '65', '66', '67', '68', '69', '77', '90'];

function normalizePhoneNumber(value: string, callingCode: string): string {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (compact.startsWith('+')) return `+${compact.slice(1).replace(/\D/g, '')}`;
  if (compact.startsWith('00')) return `+${compact.slice(2).replace(/\D/g, '')}`;
  const digits = compact.replace(/\D/g, '').replace(/^0+/, '');
  if (callingCode === '+252' && SOMALI_MOBILE_PREFIXES.some(prefix => digits.startsWith(prefix))) return `+252${digits}`;
  const countryDigits = callingCode.slice(1);
  if (digits.startsWith(countryDigits)) return `+${digits}`;
  return `${callingCode}${digits}`;
}

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
  const [identifier, setIdentifier] = useState('');
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
  const [existingAgentLink, setExistingAgentLink] = useState(false);
  const [phoneAuthEnabled, setPhoneAuthEnabled] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('SO');
  const selectedCallingCode = COUNTRY_CALLING_CODES[selectedCountry] || '+252';
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [phoneVerificationPending, setPhoneVerificationPending] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE_URL}/api/auth/methods`)
      .then(readApiJson)
      .then(methods => {
        if (!active) return;
        const enabled = methods.phoneAuthEnabled !== false;
        setPhoneAuthEnabled(enabled);
      })
      .catch(() => { /* The backend still enforces the setting. */ });
    return () => { active = false; };
  }, [API_BASE_URL]);

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
          phone: firebaseUser.phoneNumber || undefined,
          avatar: pendingSignup?.avatar || (onboardingComplete ? undefined : (isLogin ? undefined : avatar)),
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
      sessionStorage.removeItem('ludosom_phone_auth_pending');
      sessionStorage.removeItem('ludosom_auth_onboarding_pending');
      onLoginSuccess(profileData, token);

    } catch (err: any) {
      setError(userErrorMessage(err, 'Sign-in could not be completed.'));
      // If backend login fails, we should probably sign the user out of Firebase Auth too
      // to avoid a disjointed state.
      await auth.signOut();
      throw err; // re-throw to be caught by the main handleSubmit
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdentifier = identifier.trim();
    const usePhone = !cleanIdentifier.includes('@');
    if (usePhone) {
      if (!phoneAuthEnabled) {
        setError('Phone sign-in is currently unavailable. Please use your email.');
        return;
      }
      const normalizedPhone = normalizePhoneNumber(cleanIdentifier, selectedCallingCode);
      if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
        setError(`Enter a valid phone number. The selected country code is ${selectedCallingCode}.`);
        return;
      }
      if (!isLogin && !username.trim()) {
        setError(t('nameRequired'));
        return;
      }
      setLoading(true); setError(''); setSuccessMessage('');
      try {
        const methodsResponse = await fetch(`${API_BASE_URL}/api/auth/methods`);
        const methods = await readApiJson(methodsResponse);
        if (!methodsResponse.ok) throw new Error(methods.error || 'Login settings could not be checked.');
        if (methods.phoneAuthEnabled === false) {
          setPhoneAuthEnabled(false);
          throw new Error('Phone sign-in is currently disabled.');
        }
        recaptchaRef.current?.clear();
        recaptchaRef.current = new RecaptchaVerifier(auth, 'phone-recaptcha-container', {
          size: 'invisible',
          badge: 'inline',
        });
        const confirmation = await signInWithPhoneNumber(auth, normalizedPhone, recaptchaRef.current);
        setPhone(normalizedPhone);
        setPhoneConfirmation(confirmation);
        setPhoneVerificationPending(true);
        setSuccessMessage(`SMS code ayaa loo diray ${normalizedPhone}.`);
      } catch (err: any) {
        recaptchaRef.current?.clear(); recaptchaRef.current = null;
        setError(/operation-not-allowed/i.test(String(err?.code || err?.message || ''))
          ? 'Phone login has not been enabled in Firebase yet.'
          : userErrorMessage(err, 'SMS code could not be sent. Check the phone number and try again.'));
      } finally { setLoading(false); }
      return;
    }
    const normalizedEmail = cleanIdentifier.toLowerCase();
    if (!normalizedEmail || !password.trim()) {
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
        const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        await userCredential.user.reload();
        const token = await userCredential.user.getIdToken();
        const statusResponse = await fetch(`${API_BASE_URL}/api/auth/profile-status`, { headers: { Authorization: `Bearer ${token}` } });
        const profileStatus = await readApiJson(statusResponse);
        if (!statusResponse.ok) throw new Error(profileStatus.error || 'Account status could not be checked.');
        setExistingAgentLink(Boolean(profileStatus.linkedToAgent));
        if (profileStatus.otpRequired) {
          const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          const otpData = await readApiJson(otpResponse);
          if (!otpResponse.ok && otpResponse.status !== 429) throw new Error(otpData.error || 'OTP could not be sent.');
          setOtpUser(userCredential.user);
          setGoogleOnboarding(true);
          setVerificationPending(true);
          setSuccessMessage(otpResponse.ok ? '6-digit OTP ayaa loo diray email-kaaga.' : otpData.error);
          return;
        }
        if (profileStatus.linkedToAgent) {
          await handleBackendLogin(userCredential.user, true);
        } else {
          setOtpUser(userCredential.user);
          setGoogleOnboarding(true);
          setPromoStep(true);
          setSuccessMessage('You may add a promo code, or skip this step.');
        }

      } else {
        // Handle Registration
        sessionStorage.setItem('ludosom_auth_onboarding_pending', '1');
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const pendingKey = `ludosom_pending_signup_${userCredential.user.email?.trim().toLowerCase() || userCredential.user.uid}`;
        localStorage.setItem(pendingKey, JSON.stringify({ username: username.trim(), avatar, promoCode: promoCode.trim().toUpperCase() || undefined }));
        const token = await userCredential.user.getIdToken();
        const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const otpData = await readApiJson(otpResponse);
        if (!otpResponse.ok) throw new Error(otpData.error || 'OTP could not be sent.');
        if (otpData.disabled) {
          await handleBackendLogin(userCredential.user);
          return;
        }
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
            setError(userErrorMessage(err, 'Sign-in failed. Please try again.'));
            break;
        }
      } else {
        setError(userErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneConfirmation || !/^\d{6}$/.test(smsCode)) return setError('Enter the 6-digit SMS code.');
    setLoading(true); setError('');
    try {
      sessionStorage.setItem('ludosom_phone_auth_pending', '1');
      sessionStorage.setItem('ludosom_auth_onboarding_pending', '1');
      const credential = await phoneConfirmation.confirm(smsCode);
      const token = await credential.user.getIdToken();
      const statusResponse = await fetch(`${API_BASE_URL}/api/auth/profile-status`, { headers: { Authorization: `Bearer ${token}` } });
      const status = await readApiJson(statusResponse);
      if (!statusResponse.ok) throw new Error(status.error || 'Account status could not be checked.');
      if (isLogin && !status.exists) {
        sessionStorage.removeItem('ludosom_phone_auth_pending');
        sessionStorage.removeItem('ludosom_auth_onboarding_pending');
        await signOut(auth);
        throw new Error('No account exists with this phone number. Please sign up first.');
      }
      if (!isLogin && status.exists) {
        sessionStorage.removeItem('ludosom_phone_auth_pending');
        sessionStorage.removeItem('ludosom_auth_onboarding_pending');
        await signOut(auth);
        throw new Error('This phone number is already registered. Please sign in.');
      }
      setPhoneVerificationPending(false);
      setOtpUser(credential.user);
      setExistingAgentLink(Boolean(status.linkedToAgent));
      if (!isLogin) {
        const pendingKey = `ludosom_pending_signup_${credential.user.uid}`;
        localStorage.setItem(pendingKey, JSON.stringify({ username: username.trim(), avatar, promoCode: promoCode.trim().toUpperCase() || undefined }));
        await handleBackendLogin(credential.user, true);
      } else if (status.linkedToAgent) {
        await handleBackendLogin(credential.user, true);
      } else {
        setGoogleOnboarding(true);
        setPromoStep(true);
        setSuccessMessage('Phone verified. You may add a promo code, or skip this step.');
      }
    } catch (err: any) {
      if (!auth.currentUser) { sessionStorage.removeItem('ludosom_phone_auth_pending'); sessionStorage.removeItem('ludosom_auth_onboarding_pending'); }
      setError(userErrorMessage(err, 'The SMS code could not be verified.'));
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    const resetEmail = identifier.trim().toLowerCase();
    setError('');
    setSuccessMessage('');
    if (!resetEmail) {
      setError('Enter your email address first.');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setSuccessMessage('If an account uses this email, a password reset link has been sent. Check your Inbox and Spam/Junk folder.');
    } catch (err: any) {
      setError(userErrorMessage(err, 'Password reset email could not be sent. Please try again.'));
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
        if (existingAgentLink) {
          await handleBackendLogin(otpUser, true);
        } else {
          setPromoStep(true);
          setSuccessMessage('Email verified. You may add a promo code, or skip this step.');
        }
      } else {
        await handleBackendLogin(otpUser);
      }
    } catch (err: any) { setError(userErrorMessage(err, 'The code could not be verified.')); } finally { setLoading(false); }
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
    } catch (err:any) { setError(userErrorMessage(err, 'A new code could not be sent.')); } finally { setLoading(false); }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      sessionStorage.setItem('ludosom_auth_onboarding_pending', '1');
      const credential = await signInWithPopup(auth, provider);
      const token = await credential.user.getIdToken();
      const statusResponse = await fetch(`${API_BASE_URL}/api/auth/profile-status`, { headers: { Authorization: `Bearer ${token}` } });
      const status = await readApiJson(statusResponse);
      if (!statusResponse.ok) throw new Error(status.error || 'Could not check account status.');
      setExistingAgentLink(Boolean(status.linkedToAgent));
      if (status.otpRequired) {
        const otpResponse = await fetch(`${API_BASE_URL}/api/auth/otp/request`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const otpData = await readApiJson(otpResponse);
        if (!otpResponse.ok && otpResponse.status !== 429) throw new Error(otpData.error || 'OTP could not be sent.');
        setOtpUser(credential.user);
        setGoogleOnboarding(true);
        setVerificationPending(true);
        setSuccessMessage(otpResponse.ok ? '6-digit OTP ayaa loo diray Gmail-kaaga.' : otpData.error);
      } else if (status.linkedToAgent) {
        await handleBackendLogin(credential.user, true);
      } else {
        setOtpUser(credential.user);
        setGoogleOnboarding(true);
        setPromoStep(true);
        setSuccessMessage('You may add a promo code, or skip this step.');
      }
    } catch (err: any) {
      if (!auth.currentUser) sessionStorage.removeItem('ludosom_auth_onboarding_pending');
      if (err?.code !== 'auth/popup-closed-by-user') setError(userErrorMessage(err, 'Google sign-in failed.'));
    } finally {
      setLoading(false);
    }
  };

  const finishGoogleOnboarding = async () => {
    if (!otpUser) return;
    setLoading(true); setError('');
    try {
      await handleBackendLogin(otpUser, true);
    } catch (err:any) { setError(userErrorMessage(err, 'Account setup could not be completed.')); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex flex-col items-center justify-center p-4 selection:bg-purple-500 selection:text-white relative overflow-x-hidden">
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center">
        <div className="absolute w-[600px] h-[600px] rounded-full border border-purple-500/10 animate-pulse" />
        <div className="absolute w-[800px] h-[800px] rounded-full border border-purple-500/5" />
      </div>

      <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-blue-500/5 space-y-6 relative z-10">
        <div className="flex flex-col items-center text-center space-y-2">
          <img src="/ludosom-logo.png" alt="LudoSom Landhu" className="h-20 w-20 rounded-2xl object-cover shadow-lg shadow-purple-500/20 ring-1 ring-yellow-400/40" />
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

        {phoneVerificationPending ? (
          <form onSubmit={handleVerifyPhone} className="space-y-4">
            <div className="text-center"><h2 className="text-xl font-black">Verify Phone Number</h2><p className="mt-2 text-xs text-slate-400">Enter the 6-digit SMS code sent to {phone}</p></div>
            <input value={smsCode} onChange={e => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="000000" className="w-full rounded-xl border border-purple-400/40 bg-black/30 px-4 py-4 text-center text-3xl font-black tracking-[0.5em] text-white outline-none focus:border-purple-300" />
            <button disabled={loading || smsCode.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 py-3.5 text-sm font-black disabled:opacity-50">{loading ? 'Verifying...' : 'Verify SMS Code'}</button>
            <button type="button" onClick={() => { setPhoneVerificationPending(false); setSmsCode(''); setPhoneConfirmation(null); recaptchaRef.current?.clear(); recaptchaRef.current = null; }} className="w-full text-xs font-bold text-blue-300 hover:text-blue-200">Change phone number</button>
          </form>
        ) : promoStep ? (
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
                      {av.startsWith('/') ? <img src={av} alt="LudoSom avatar" className="h-8 w-8 rounded-lg object-cover" /> : av}
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
                <Mail className="w-3 h-3 text-slate-500" /><Phone className="w-3 h-3 text-slate-500" /> Email or Phone Number
              </label>
              <div className="flex overflow-hidden rounded-xl border border-white/10 bg-black/30 transition-all focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
                {phoneAuthEnabled && (
                  <select
                    value={selectedCountry}
                    onChange={e => { setSelectedCountry(e.target.value); setError(''); }}
                    aria-label="Phone country"
                    className="w-[108px] shrink-0 border-r border-white/10 bg-slate-950 px-2 text-xs font-bold text-white outline-none sm:w-[126px]"
                  >
                    {COUNTRY_OPTIONS.map(([region, name]) => <option key={region} value={region}>{name} {COUNTRY_CALLING_CODES[region]}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  required
                  placeholder={phoneAuthEnabled ? 'Email or phone' : 'Email address'}
                  value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none placeholder-slate-500"
                />
              </div>
              {phoneAuthEnabled && identifier.trim() && !identifier.includes('@') && (
                <p className="px-1 text-[11px] font-medium text-emerald-300">SMS → {normalizePhoneNumber(identifier, selectedCallingCode)}</p>
              )}
          </div>

          {(identifier.length === 0 || identifier.includes('@')) && <div className="space-y-1">
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
              {isLogin && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs font-bold text-blue-400 transition hover:text-blue-300 hover:underline disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>}

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

        <div id="phone-recaptcha-container" className="flex items-center justify-center overflow-visible [&>div]:mx-auto" />

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
