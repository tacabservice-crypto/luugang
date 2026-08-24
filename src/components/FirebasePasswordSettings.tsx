import React, { useMemo, useState } from 'react';
import { EmailAuthProvider, linkWithCredential, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../firebase-client';
import { userErrorMessage } from '../utils/userError';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function FirebasePasswordSettings() {
  const { language } = useLanguage();
  const so = language === 'so';
  const firebaseUser = auth.currentUser;
  const hasPassword = useMemo(
    () => Boolean(firebaseUser?.providerData.some(provider => provider.providerId === 'password')),
    [firebaseUser]
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!firebaseUser?.email) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (newPassword.length < 6) return setMessage({ type: 'error', text: 'Use a password with at least 6 characters.' });
    if (newPassword !== confirmPassword) return setMessage({ type: 'error', text: 'The new passwords do not match.' });

    setSaving(true);
    try {
      if (hasPassword) {
        if (!currentPassword) throw new Error('Current password is required.');
        await reauthenticateWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, currentPassword));
        await updatePassword(firebaseUser, newPassword);
        setMessage({ type: 'success', text: 'Password changed successfully.' });
      } else {
        await linkWithCredential(firebaseUser, EmailAuthProvider.credential(firebaseUser.email, newPassword));
        await firebaseUser.reload();
        setMessage({ type: 'success', text: 'Password created. You can now sign in with Google or email and password.' });
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage({ type: 'error', text: userErrorMessage(error, hasPassword ? 'Password could not be changed.' : 'Password could not be created.') });
    } finally {
      setSaving(false);
    }
  };

  if (hasPassword && !expanded) return <button type="button" onClick={() => setExpanded(true)} className="flex w-full items-center justify-between rounded-2xl border border-blue-400/15 bg-gradient-to-br from-blue-500/[.07] to-purple-500/[.06] p-4 text-left transition hover:border-blue-400/30"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"><LockKeyhole className="h-4 w-4 text-blue-300" /></span><span><strong className="block text-xs font-black text-white">{so ? 'Beddel Erayga Sirta ah' : 'Change Password'}</strong><span className="mt-1 block text-[9px] font-semibold text-slate-400">{so ? 'Taabo si aad qaybta amniga u furto' : 'Tap to open password security'}</span></span></span><span className="text-lg font-black text-blue-300">›</span></button>;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-blue-400/15 bg-gradient-to-br from-blue-500/[.07] to-purple-500/[.06] p-4">
      <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10"><ShieldCheck className="h-4 w-4 text-blue-300" /></span><div>
        <h3 className="text-xs font-black text-white">{hasPassword ? (so ? 'Beddel Erayga Sirta ah' : 'Change Password') : (so ? 'Samee Eray Sir ah' : 'Create Password')}</h3>
        <p className="mt-1 text-[10px] leading-5 text-slate-400">
          {hasPassword ? (so ? 'Xaqiiji eraygaaga hadda ka hor intaadan mid cusub dooran.' : 'Confirm your current password before choosing a new one.') : (so ? `U samee ${firebaseUser.email} eray sir ah si aad qalab kale uga geli karto.` : `Create a password for ${firebaseUser.email} so you can sign in without Google on another device.`)}
        </p>
      </div></div>
      {hasPassword && <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder={so ? 'Erayga sirta ah ee hadda' : 'Current password'} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none focus:border-blue-400" required />}
      <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" placeholder={so ? 'Eray sir ah oo cusub' : 'New password'} minLength={6} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none focus:border-blue-400" required />
      <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder={so ? 'Xaqiiji erayga cusub' : 'Confirm new password'} minLength={6} className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none focus:border-blue-400" required />
      {message && <p className={`text-xs ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
      <div className="flex gap-2">{hasPassword && <button type="button" onClick={() => setExpanded(false)} className="rounded-xl border border-white/10 bg-white/5 px-3 text-[10px] font-black text-slate-300">{so ? 'Xir' : 'Close'}</button>}<button type="submit" disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-400/20 bg-blue-600 px-4 py-2.5 text-xs font-black text-white transition hover:bg-blue-500 disabled:opacity-50"><LockKeyhole className="h-3.5 w-3.5" />
        {saving ? (so ? 'Kaydinaya…' : 'Saving…') : hasPassword ? (so ? 'Beddel Erayga Sirta ah' : 'Change Password') : (so ? 'Samee Eray Sir ah' : 'Create Password')}
      </button></div>
    </form>
  );
}
