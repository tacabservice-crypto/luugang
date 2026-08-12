import React, { useState, useEffect } from 'react';
import { Agent } from '../types/game';

interface CreditAgentModalProps {
    agent: Agent;
    onClose: () => void;
    onSave: (agentId: string, amount: number, discount: number) => Promise<void>;
}

const CreditAgentModal: React.FC<CreditAgentModalProps> = ({ agent, onClose, onSave }) => {
    const [amount, setAmount] = useState('');
    const [commission, setCommission] = useState(0); // This is the agent's profit/discount
    const [cashAgentSends, setCashAgentSends] = useState(0); // Amount of cash agent sends to admin
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const creditAmount = parseFloat(amount);
        if (!isNaN(creditAmount) && creditAmount > 0) {
            const calculatedCommission = creditAmount * agent.commissionRate;
            setCommission(calculatedCommission);
            setCashAgentSends(creditAmount - calculatedCommission);
        } else {
            setCommission(0);
            setCashAgentSends(0);
        }
    }, [amount, agent.commissionRate]);

    const handleSave = async () => {
        setError(null);
        const creditAmount = parseFloat(amount);
        // The 'discount' sent to the backend is the agent's commission
        const discountAmount = commission; 
        
        if (isNaN(creditAmount) || creditAmount === 0) {
            setError('Enter a positive amount to add or a negative amount to deduct.');
            return;
        }
        const currentFloat = agent.floatBalance ?? agent.balance ?? 0;
        if (currentFloat + creditAmount < 0) {
            setError(`You cannot deduct more than the current float balance of $${currentFloat.toFixed(2)}.`);
            return;
        }
        if (creditAmount - discountAmount < 0) {
            setError('Commission cannot be greater than the credit amount.');
            return;
        }

        setIsSaving(true);
        try {
            await onSave(agent.id, creditAmount, discountAmount);
            onClose();
        } catch (e: any) {
            setError(e.message || 'Failed to credit float.');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                <h2 className="text-xl font-bold mb-2 text-white">Adjust Float for {agent.username}</h2>
                <p className="mb-4 text-sm text-gray-400">Use a positive amount to add float or a negative amount to correct an over-credit.</p>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Adjustment Amount</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={(e) => setAmount(e.target.value)} 
                            placeholder="e.g. 100 to add, or -100 to deduct"
                            className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" 
                        />
                    </div>
                    <div className="bg-gray-700 p-3 rounded-lg space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Current Float:</span>
                            <span className="text-white font-mono">${(agent.floatBalance ?? agent.balance ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold">
                            <span className="text-gray-300">New Float:</span>
                            <span className={`font-mono ${(agent.floatBalance ?? agent.balance ?? 0) + (parseFloat(amount) || 0) < (agent.floatBalance ?? agent.balance ?? 0) ? 'text-red-400' : 'text-green-400'}`}>${((agent.floatBalance ?? agent.balance ?? 0) + (parseFloat(amount) || 0)).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Agent's Commission Rate:</span>
                            <span className="text-white font-mono">{(agent.commissionRate * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-400">Commission on addition:</span>
                            <span className="text-white font-mono">${commission.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-lg font-bold">
                            <span className="text-purple-400">Cash Agent Sends to Admin:</span>
                            <span className="text-purple-400 font-mono">${cashAgentSends.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:bg-green-400">
                        {isSaving ? 'Saving...' : 'Apply Adjustment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreditAgentModal;
