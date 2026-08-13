import React, { useState } from 'react';
import { userErrorMessage } from '../utils/userError';

interface ChangePasswordFormProps {
    adminId: string;
    onError: (message: string) => void;
    onSuccess: (message: string) => void;
}

const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({ adminId, onError, onSuccess }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmNewPassword) {
            onError('New password and confirmation do not match.');
            return;
        }
        if (newPassword.length < 6) {
            onError('New password must be at least 6 characters long.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/admin/settings?userId=${adminId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to change password.');
            }

            onSuccess('Password changed successfully!');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
        } catch (err: any) {
            onError(userErrorMessage(err, 'Password could not be changed.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-400">Current Password</label>
                <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1"
                    required
                    disabled={isSubmitting}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400">New Password</label>
                <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1"
                    required
                    disabled={isSubmitting}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-400">Confirm New Password</label>
                <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1"
                    required
                    disabled={isSubmitting}
                />
            </div>
            <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Changing...' : 'Change Password'}
            </button>
        </form>
    );
};

export default ChangePasswordForm;
