import React, { useState } from 'react';

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateAgent: (agentData: { username: string, password: string, commissionRate: string, location?: string, phone: string, promoCode?: string }) => Promise<void>;
}

const CreateAgentModal: React.FC<CreateAgentModalProps> = ({ isOpen, onClose, onCreateAgent }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [commissionRate, setCommissionRate] = useState('0.1');
    const [location, setLocation] = useState('');
    const [phone, setPhone] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setError(null);
        if (!phone || !promoCode.trim()) {
            setError("Phone number and promo code are required.");
            return;
        }
        setIsSubmitting(true);
        try {
            await onCreateAgent({ username, password, commissionRate, location, phone, promoCode });
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-4 text-white">Create New Agent</h2>
                {error && <p className="text-red-500 mb-4">{error}</p>}
                <div className="space-y-4">
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Phone Number"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                    <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Promo Code (required)"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                    <input
                        type="number"
                        value={commissionRate}
                        onChange={(e) => setCommissionRate(e.target.value)}
                        placeholder="Commission Rate (e.g., 0.1 for 10%)"
                        step="0.01"
                        max="1"
                        min="0"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                    <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Location (e.g., Mogadishu)"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded"
                        disabled={isSubmitting}
                    />
                </div>
                <div className="mt-6 flex justify-end space-x-4">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded" disabled={isSubmitting}>
                        Close
                    </button>
                    <button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Agent'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateAgentModal;
