import React, { useState } from 'react';

interface ChangePasswordModalProps {
    onClose: () => void;
    onSave: (password: string) => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, onSave }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        // In a real app, you'd also verify the current password on the backend.
        onSave(newPassword);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-white">Change Password</h2>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Current Password</label>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">New Password</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Confirm New Password</label>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                </div>

                {error && <p className="text-red-500 mt-4">{error}</p>}

                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                        Cancel
                    </button>
                    <button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded ml-3">
                        Save Password
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
