/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Agent, AgentTransaction, AgentRequest, PlayerAgentRequest } from './types/game';
import toast, { Toaster } from 'react-hot-toast';

// Transaction Detail Modal Component
const TransactionDetailModal: React.FC<{ transaction: AgentTransaction; onClose: () => void }> = ({ transaction, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-md relative border border-slate-700">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 text-2xl"
                >
                    &times;
                </button>
                <h3 className="text-2xl font-bold text-purple-400 mb-4">Transaction Details</h3>
                <div className="space-y-3 text-slate-300">
                    <p><strong>ID:</strong> <span className="font-mono text-sm">{transaction.id}</span></p>
                    <p><strong>Type:</strong> <span className={`font-semibold ${transaction.type === 'PlayerDeposit' || transaction.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>{transaction.type}</span></p>
                    <p><strong>Amount:</strong> <span className="font-mono">${transaction.amount.toFixed(2)}</span></p>
                    {transaction.discountAmount && <p><strong>Discount:</strong> <span className="font-mono">${transaction.discountAmount.toFixed(2)}</span></p>}
                    <p><strong>Date:</strong> {new Date(transaction.timestamp).toLocaleString()}</p>
                    {transaction.description && <p><strong>Description:</strong> {transaction.description}</p>}
                    {transaction.playerId && <p><strong>Player ID:</strong> <span className="font-mono text-sm">{transaction.playerId}</span></p>}
                    {transaction.playerName && <p><strong>Player Name:</strong> {transaction.playerName}</p>}
                    {transaction.agentId && <p><strong>Agent ID:</strong> <span className="font-mono text-sm">{transaction.agentId}</span></p>}
                </div>
            </div>
        </div>
    );
};


// A simple API client
const AgentDashboard = () => {
    const [agent, setAgent] = useState<Agent | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [requestAmount, setRequestAmount] = useState('');
    const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
    const [playerRequests, setPlayerRequests] =useState<PlayerAgentRequest[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [lastFetchedRequestIds, setLastFetchedRequestIds] = useState<Set<string>>(new Set());
    const [selectedTransaction, setSelectedTransaction] = useState<AgentTransaction | null>(null); // New state
    const [paymentInstructions, setPaymentInstructions] = useState('');
    const [cashToSend, setCashToSend] = useState(0);
    const [linkedPlayers, setLinkedPlayers] = useState<UserProfile[]>([]);

    const fetchLinkedPlayers = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/my-players?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch linked players');
            const data = await response.json();
            setLinkedPlayers(data);
        } catch (err: any) {
            setError(err.message);
        }
    };

    useEffect(() => {
        if (agent && requestAmount) {
            const amount = parseFloat(requestAmount);
            if (!isNaN(amount) && amount > 0) {
                const cash = amount * (1 - agent.commissionRate);
                setCashToSend(cash);
            } else {
                setCashToSend(0);
            }
        } else {
            setCashToSend(0);
        }
    }, [requestAmount, agent]);

    const fetchPaymentInstructions = async () => {
        try {
            const response = await fetch('/api/agent/payment-instructions');
            if (!response.ok) {
                console.error('Could not fetch payment instructions');
                return;
            }
            const data = await response.json();
            setPaymentInstructions(data.instructions);
        } catch (err) {
            console.error('Error fetching payment instructions:', err);
        }
    };



    const ITEMS_PER_PAGE = 10;
    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentTransactions = transactions.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);

    const fetchAgentRequests = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/requests?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch agent requests');
            const data = await response.json();
            setAgentRequests(data);
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    const fetchPlayerRequests = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/player-requests?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch player requests');
            const data: PlayerAgentRequest[] = await response.json();
            
            const currentPendingRequestIds = new Set(data.filter(req => req.status === 'pending').map(req => req.id));
            
            // Check for new requests only if lastFetchedRequestIds has been initialized
            if (lastFetchedRequestIds.size > 0) {
                const newRequestIds = [...currentPendingRequestIds].filter(id => !lastFetchedRequestIds.has(id));
                if (newRequestIds.length > 0) {
                    toast.success(`You have ${newRequestIds.length} new player transaction request(s)!`);
                }
            }
    
            setLastFetchedRequestIds(currentPendingRequestIds);
            setPlayerRequests(data);
        } catch (err: any) {
            // Avoid spamming errors on polling failures
            console.error(err.message);
        }
    };

    const handleApprove = async (requestId: string) => {
        const agentId = localStorage.getItem('agentId');
        if (!agentId) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/agent/player-requests/${requestId}/approve?agentId=${agentId}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to approve request');
            await fetchPlayerRequests(agentId);
            await fetchProfile(agentId); // Re-fetch agent profile to update float balance
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async (requestId: string) => {
        const agentId = localStorage.getItem('agentId');
        if (!agentId) return;
        setLoading(true);
        try {
            const response = await fetch(`/api/agent/player-requests/${requestId}/reject?agentId=${agentId}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to reject request');
            await fetchPlayerRequests(agentId);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestFloat = async (e: React.FormEvent) => {
        e.preventDefault();
        const agentId = localStorage.getItem('agentId');
        if (!requestAmount || parseFloat(requestAmount) <= 0 || !agentId) {
          setError('Please enter a valid amount to request.');
          return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/agent/request-float?agentId=${agentId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: requestAmount,
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Float request failed');
            
            alert(`Success! Your request for $${requestAmount} has been submitted.`);
            await fetchAgentRequests(agentId); // Refresh requests
            setRequestAmount('');
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/agent/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }
            localStorage.setItem('agentId', data.agent.id);
            setAgent(data.agent);
            setIsLoggedIn(true);
            await fetchTransactions(data.agent.id);
            await fetchAgentRequests(data.agent.id);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('agentId');
        setIsLoggedIn(false);
        setAgent(null);
        setTransactions([]);
        setUsername('');
        setPassword('');
    };

    const fetchTransactions = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/transactions?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch transactions');
            const data = await response.json();
            setTransactions(data);
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    const fetchProfile = async (agentId: string) => {
        setLoading(true);
        try {
            const response = await fetch(`/api/agent/profile?agentId=${agentId}`);
            if (!response.ok) {
                handleLogout();
                throw new Error('Session expired or invalid.');
            }
            const data = await response.json();
            setAgent(data);
            setIsLoggedIn(true);
            await fetchTransactions(data.id);
            await fetchAgentRequests(data.id);
            await fetchPaymentInstructions();
            await fetchLinkedPlayers(data.id);
            // No longer fetching player requests here, the polling useEffect will handle it
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const storedAgentId = localStorage.getItem('agentId');
        if (storedAgentId) {
            fetchProfile(storedAgentId);
        } else {
            setLoading(false);
        }
    }, []);

    // Effect for polling player requests
    useEffect(() => {
        const agentId = agent?.id;
        if (isLoggedIn && agentId) {
            // Initial fetch to populate the list and IDs
            fetchPlayerRequests(agentId);

            const intervalId = setInterval(() => {
                fetchPlayerRequests(agentId);
            }, 5000); // Poll every 5 seconds

            return () => clearInterval(intervalId); // Cleanup on unmount or when agent logs out
        }
    }, [isLoggedIn, agent?.id]);

    if (loading && !isLoggedIn) {
        return <div className="h-screen bg-gray-900 text-white flex items-center justify-center"><div>Loading...</div></div>;
    }

    if (!isLoggedIn || !agent) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="w-full max-w-sm p-6 bg-slate-800 border border-slate-700 rounded-xl">
                    <h1 className="text-2xl font-bold text-center text-purple-400">Agent Login</h1>
                    <form onSubmit={handleLogin} className="mt-4">
                        <div className="mb-4">
                            <label className="block text-gray-400 mb-2" htmlFor="username">Username</label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter Username"
                                className="w-full bg-slate-700 p-2 rounded-lg border border-slate-600"
                                required
                            />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-400 mb-2" htmlFor="password">Password</label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter Password"
                                className="w-full bg-slate-700 p-2 rounded-lg border border-slate-600"
                                required
                            />
                        </div>
                        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-bold disabled:bg-slate-500"
                        >
                            {loading ? 'Logging in...' : 'Login'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 text-white min-h-screen p-4 md:p-8">
            <Toaster />
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-purple-400">Agent Dashboard</h1>
              <button onClick={handleLogout} className="text-sm text-red-400 hover:underline">Logout</button>
            </div>
            
            <div className="mt-4 text-lg">
              Welcome, <span className="font-bold">{agent?.username}</span>!
            </div>
            {agent?.promoCode && (
                <div className="mt-2 text-sm text-slate-400">
                    Your Promo Code: <span className="font-bold text-purple-400 p-1 bg-slate-700 rounded-md">{agent.promoCode}</span>
                </div>
            )}
            <div className="mt-2 p-4 bg-green-800/50 border border-green-500 rounded-xl">
              Float Balance: <span className="font-mono text-2xl font-bold">${agent?.floatBalance.toFixed(2)}</span>
            </div>
    
            {error && <div className="mt-4 p-3 bg-red-800/50 border border-red-500 rounded-xl text-white">{error}</div>}
            
            <div className="mt-8 p-6 bg-slate-800 border border-slate-700 rounded-xl">
              <h2 className="text-2xl font-semibold">Player Transaction Requests</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-700 text-xs text-slate-300 uppercase">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Player</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Type</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {playerRequests.map(req => (
                            <tr key={req.id} className="border-b border-slate-700 last:border-b-0">
                                <td className="px-4 py-3 text-slate-400">{new Date(req.createdAt).toLocaleString()}</td>
                                <td className="px-4 py-3 font-medium flex items-center gap-2">
                                    <span className="text-xl">{req.playerAvatar}</span>
                                    {req.playerUsername}
                                </td>
                                <td className="px-4 py-3 font-mono">
                                    {req.type === 'deposit' ? req.senderPhone : req.playerPhone}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`font-semibold ${req.type === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                                        {req.type.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-right">${req.amount.toFixed(2)}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                        req.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                                        req.status === 'approved' ? 'bg-green-900 text-green-200' :
                                        'bg-red-900 text-red-200'
                                    }`}>
                                        {req.status}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {req.status === 'pending' && (
                                        <div className="flex gap-2 justify-center">
                                            <button 
                                                onClick={() => handleApprove(req.id)} 
                                                disabled={loading}
                                                className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded font-bold text-xs disabled:bg-slate-500">
                                                Approve
                                            </button>
                                            <button 
                                                onClick={() => handleReject(req.id)} 
                                                disabled={loading}
                                                className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-bold text-xs disabled:bg-slate-500">
                                                Reject
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 p-6 bg-slate-800 border border-slate-700 rounded-xl">
              <h2 className="text-2xl font-semibold">Request Float</h2>
              <form onSubmit={handleRequestFloat} className="mt-4">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={requestAmount}
                    onChange={(e) => setRequestAmount(e.target.value)}
                    placeholder="Enter amount to request"
                    className="flex-grow bg-slate-700 p-2 rounded-lg border border-slate-600"
                    required
                  />
                  <button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 px-5 py-2 rounded-lg font-bold disabled:bg-slate-500">
                    {loading ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
                <div className="mt-4 p-4 bg-slate-700 rounded-lg">
                        <h3 className="text-lg font-semibold text-purple-400">Payment Instructions</h3>
                        {paymentInstructions ? (
                            <p className="text-slate-300 whitespace-pre-wrap">{paymentInstructions}</p>
                        ) : (
                            <p className="text-slate-400 italic">No payment instructions available. Please contact an admin to have them set up.</p>
                        )}
                    </div>
                <div className="mt-4 bg-gray-700 p-3 rounded-lg space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Your Commission Rate:</span>
                        <span className="text-white font-mono">{(agent.commissionRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                        <span className="text-purple-400">Cash You Send to Admin:</span>
                        <span className="text-purple-400 font-mono">${cashToSend.toFixed(2)}</span>
                    </div>
                </div>
            </div>
    
            <div className="mt-8">
                <h2 className="text-2xl font-semibold">My Linked Players</h2>
                <div className="mt-4 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-700 text-xs text-slate-300 uppercase">
                            <tr>
                                <th className="px-4 py-3">Player</th>
                                <th className="px-4 py-3 text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linkedPlayers.map(player => (
                                <tr key={player.id} className="border-b border-slate-700 last:border-b-0">
                                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                                        <span className="text-xl">{player.avatar}</span>
                                        {player.username}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-right">${player.balance.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-8">
                <h2 className="text-2xl font-semibold">Transaction History</h2>
                <div className="mt-4 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-700 text-xs text-slate-300 uppercase">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentTransactions.map(tx => (
                                <tr key={tx.id} 
                                    className="border-b border-slate-700 last:border-b-0 cursor-pointer hover:bg-slate-700"
                                    onClick={() => setSelectedTransaction(tx)}
                                >
                                    <td className="px-4 py-3 text-slate-400">{new Date(tx.timestamp).toLocaleString()}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                            tx.type === 'PlayerDeposit' || tx.type === 'FloatPurchase' ? 'bg-blue-900 text-blue-200' : 
                                            tx.type === 'PlayerWithdrawal' ? 'bg-yellow-900 text-yellow-200' : 
                                            'bg-green-900 text-green-200'
                                        }`}>
                                            {tx.type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">{tx.description}</td>
                                    <td className={`px-4 py-3 font-mono text-right ${tx.type === 'PlayerDeposit' ? 'text-red-400' : 'text-green-400'}`}>
                                        {tx.type === 'PlayerDeposit' ? '-' : '+'}${tx.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="mt-4 flex justify-center items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50"
                        >
                            &laquo;
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1 rounded ${currentPage === page ? 'bg-purple-600' : 'bg-slate-700'}`}
                            >
                                {page}
                            </button>
                        ))}
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50"
                        >
                            &raquo;
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-8">
                <h2 className="text-2xl font-semibold">My Float Requests</h2>
                <div className="mt-4 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-700 text-xs text-slate-300 uppercase">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Amount</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agentRequests.map(req => (
                                <tr key={req.id} className="border-b border-slate-700 last:border-b-0">
                                    <td className="px-4 py-3 text-slate-400">{new Date(req.createdAt).toLocaleString()}</td>
                                    <td className="px-4 py-3 font-mono">${req.amount.toFixed(2)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                            req.status === 'pending' ? 'bg-yellow-900 text-yellow-200' :
                                            req.status === 'approved' ? 'bg-green-900 text-green-200' :
                                            'bg-red-900 text-red-200'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
    
          </div>
          {selectedTransaction && (
                <TransactionDetailModal
                    transaction={selectedTransaction}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </div>
      );
};


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AgentDashboard />
  </React.StrictMode>
);
