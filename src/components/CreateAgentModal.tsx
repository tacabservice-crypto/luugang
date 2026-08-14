import React, { useState } from 'react';
import { userErrorMessage } from '../utils/userError';
import LocationPicker from './LocationPicker';

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateAgent: (agentData: any) => Promise<void>;
}

const CreateAgentModal: React.FC<CreateAgentModalProps> = ({ isOpen, onClose, onCreateAgent }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [commissionRate, setCommissionRate] = useState('0.1');
    const [location, setLocation] = useState('');
    const [phone, setPhone] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [businessModel, setBusinessModel] = useState<'independent'|'monthly'>('independent');
    const [monthlySalary, setMonthlySalary] = useState('');
    const [monthlyTarget, setMonthlyTarget] = useState('');
    const [dailyTransactionLimit, setDailyTransactionLimit] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        setError(null);
        if (!phone || !promoCode.trim() || !location) {
            setError("Phone number, promo code, and location are required.");
            return;
        }
        setIsSubmitting(true);
        try {
            await onCreateAgent({ username, password, commissionRate: businessModel === 'monthly' ? '0' : commissionRate, location, phone, promoCode, businessModel, monthlySalary, monthlyTarget, dailyTransactionLimit });
            onClose();
        } catch (err: any) {
            setError(userErrorMessage(err, 'Agent could not be created.'));
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
                    <select value={businessModel} onChange={e=>setBusinessModel(e.target.value as any)} className="bg-gray-700 text-white w-full px-4 py-2 rounded"><option value="independent">Independent — Float & Commission</option><option value="monthly">Monthly Salaried Agent</option></select>
                    {businessModel==='monthly' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><input type="number" min="0" value={monthlySalary} onChange={e=>setMonthlySalary(e.target.value)} placeholder="Monthly salary" className="bg-gray-700 text-white px-3 py-2 rounded"/><input type="number" min="0" value={monthlyTarget} onChange={e=>setMonthlyTarget(e.target.value)} placeholder="Monthly target" className="bg-gray-700 text-white px-3 py-2 rounded"/><input type="number" min="0" value={dailyTransactionLimit} onChange={e=>setDailyTransactionLimit(e.target.value)} placeholder="Daily limit" className="bg-gray-700 text-white px-3 py-2 rounded"/></div>}
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
                    <LocationPicker value={location} onChange={setLocation} disabled={isSubmitting} className="bg-gray-700 text-white w-full px-4 py-2 rounded" />
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
