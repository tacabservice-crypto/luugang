import React, { useState, useEffect } from 'react';
import { Agent } from '../types/game';

interface EditAgentModalProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agentId: string, data: Partial<Agent>) => Promise<void>;
}

const EditAgentModal: React.FC<EditAgentModalProps> = ({ agent, onClose, onSave }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [commissionRate, setCommissionRate] = useState('');
    const [location, setLocation] = useState('');
    const [phone, setPhone] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (agent) {
            setUsername(agent.username);
            setCommissionRate(String(agent.commissionRate));
            setLocation(agent.location || '');
            setPhone(agent.phone || '');
            setPromoCode(agent.promoCode || '');
            setPassword(''); // Don't pre-fill password
        }
    }, [agent]);

    const handleSave = async () => {
        setError(null);
        const rate = parseFloat(commissionRate);
        if (isNaN(rate) || rate < 0 || rate > 1) {
            setError('Commission rate must be a number between 0 and 1.');
            return;
        }
        if (password && password.length < 6) {
            setError('New password must be at least 6 characters long.');
            return;
        }
        if (!phone) {
            setError('Phone number is required.');
            return;
        }

        setIsSaving(true);
        try {
            const dataToSave: Partial<Agent> = {
                username,
                commissionRate: rate,
                location,
                phone,
                promoCode,
            };
            if (password) {
                dataToSave.password = password;
            }
            await onSave(agent.id, dataToSave);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to save agent.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-white">Edit Agent: {agent.username}</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Username</label>
                        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Reset Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep current password" className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Phone Number</label>
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Promo Code</label>
                        <input type="text" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Commission Rate (e.g., 0.05 for 5%)</label>
                        <input type="text" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-400">Location</label>
                        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Mogadishu" className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" />
                    </div>
                </div>
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:bg-purple-400">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditAgentModal;
