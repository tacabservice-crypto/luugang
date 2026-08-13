import React, { useMemo, useState } from 'react';
import { EmailAuthProvider, linkWithCredential, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '../firebase-client';
import { userErrorMessage } from '../utils/userError';

export default function FirebasePasswordSettings() {
  const firebaseUser = auth.currentUser;
  const hasPassword = useMemo(
    () => Boolean(firebaseUser?.providerData.some(provider => provider.providerId === 'password')),
    [firebaseUser]
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-4">
      <div>
        <h3 className="text-sm font-bold text-white">{hasPassword ? 'Change Password' : 'Create Password'}</h3>
        <p className="mt-1 text-xs text-gray-400">
          {hasPassword ? 'Confirm your current password before choosing a new one.' : `Create a password for ${firebaseUser.email} so you can sign in without Google on another device.`}
        </p>
      </div>
      {hasPassword && <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" placeholder="Current password" className="w-full rounded bg-gray-700 px-3 py-2 text-white" required />}
      <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="New password" minLength={6} className="w-full rounded bg-gray-700 px-3 py-2 text-white" required />
      <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="Confirm new password" minLength={6} className="w-full rounded bg-gray-700 px-3 py-2 text-white" required />
      {message && <p className={`text-xs ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
      <button type="submit" disabled={saving} className="w-full rounded bg-purple-600 px-4 py-2 font-bold text-white hover:bg-purple-700 disabled:opacity-50">
        {saving ? 'Saving...' : hasPassword ? 'Change Password' : 'Create Password'}
      </button>
    </form>
  );
}
