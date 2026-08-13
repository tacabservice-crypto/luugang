import React, { useState } from 'react';
import { UserProfile } from '../types/game';
import { isFullAdmin } from '../utils/admin';
import FirebasePasswordSettings from './FirebasePasswordSettings';

interface Role {
    id: string;
    name: string;
}

interface UserEditModalProps {
    user: UserProfile;
    onClose: () => void;
    onSave: (updatedUser: Partial<UserProfile>) => Promise<void>;
    isAdmin?: boolean;
    roles?: Role[];
}

const AVATARS = ['😀', '😎', '🚀', '🧠', '👑', '💪', '🎉', '🔥', '💯', '🎲', '🤔','😂','😃','😄','😅','😆','😉','😊','😋','😌','😍','😏','😐','😑','😒','😓','pensive','😕','😖','😗','😘','😙','😚','😛','😜','😝','😞','😟','😠','😡','😢','😣','😤','😥','😦','😧','😨','😩','😪','😫','😬','😭','😮','😯','😰','😱','😲','😳','😴','😵','😶','😷'];

const UserEditModal: React.FC<UserEditModalProps> = ({ user, onClose, onSave, isAdmin = false, roles = [] }) => {
    const isProtected = isFullAdmin(user);
    const [formData, setFormData] = useState({
        username: user.username,
        avatar: user.avatar,
        role: user.role || 'player',
    });
    const [newPassword, setNewPassword] = useState('');
    const [customAvatar, setCustomAvatar] = useState('');
    const [avatarType, setAvatarType] = useState<'emoji' | 'url'>('emoji');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAvatarSelect = (avatar: string) => {
        setFormData(prev => ({ ...prev, avatar }));
        setAvatarType('emoji');
    };

    const handleSave = async () => {
        if (isProtected) {
            setError('Full Admin accounts are protected and cannot be edited, suspended, or deleted.');
            return;
        }
        setError(null);
        setIsSaving(true);
        const dataToSave: Partial<UserProfile> = { ...formData };
        
        if (newPassword) {
            dataToSave.password = newPassword;
        }

        if (avatarType === 'url' && customAvatar) {
            dataToSave.avatar = customAvatar;
        }
        try {
            await onSave(dataToSave);
            onClose();
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                    <h2 className="text-xl font-bold mb-4 text-white">Edit {isAdmin ? `User: ${user.username}` : "Your Profile"}</h2>
                    
                    {isProtected && (
                        <div className="p-3 mb-4 bg-amber-900/50 border border-amber-500/50 rounded text-amber-200 text-sm flex items-center gap-2">
                            <span>🔒 Full Admin accounts are protected and cannot be edited, suspended, or deleted.</span>
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Username</label>
                            <input type="text" name="username" value={formData.username} onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                        </div>
                        {!isAdmin && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Avatar</label>
                                    <div className="flex items-center space-x-2 mt-1">
                                        <button onClick={() => setAvatarType('emoji')} className={`px-3 py-1 text-sm rounded ${avatarType === 'emoji' ? 'bg-purple-600' : 'bg-gray-700'}`}>Emoji</button>
                                        <button onClick={() => setAvatarType('url')} className={`px-3 py-1 text-sm rounded ${avatarType === 'url' ? 'bg-purple-600' : 'bg-gray-700'}`}>Image URL</button>
                                    </div>
                                    {avatarType === 'emoji' ? (
                                        <div className="grid grid-cols-8 gap-2 bg-gray-700 p-2 rounded-lg mt-2">
                                            {AVATARS.map(avatar => (
                                                <button 
                                                    key={avatar} 
                                                    onClick={() => handleAvatarSelect(avatar)} 
                                                    className={`text-2xl rounded-lg p-1 transition-all ${formData.avatar === avatar ? 'bg-purple-600 ring-2 ring-purple-400' : 'hover:bg-gray-600'}`}
                                                >
                                                    {avatar}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-2">
                                            <input type="text" value={customAvatar} onChange={(e) => setCustomAvatar(e.target.value)} placeholder="https://example.com/avatar.png" className="bg-gray-700 text-white w-full px-3 py-2 rounded" />
                                            {customAvatar && <img src={customAvatar} alt="Avatar Preview" className="w-20 h-20 rounded-full mt-2" />}
                                        </div>
                                    )}
                                </div>
                                <FirebasePasswordSettings />
                            </>
                        )}
                        {isAdmin && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Role</label>
                                    <select 
                                        name="role" 
                                        value={formData.role} 
                                        onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))} 
                                        className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1"
                                    >
                                        <option value="player">Player</option>
                                        {roles.map(role => (
                                            <option key={role.id} value={role.id}>{role.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400">Set/Reset Password</label>
                                    <input 
                                        type="text" 
                                        name="password" 
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)} 
                                        placeholder="Enter new password (optional)"
                                        className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" 
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="mt-6 flex justify-between items-center">
                        <div>
                            <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                                Cancel
                            </button>
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving || isProtected}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded ml-3 disabled:bg-purple-400 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'Kaydinaya...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                </div>
            </div>
        </>
    );
};

export default UserEditModal;
