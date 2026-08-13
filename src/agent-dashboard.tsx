/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { Agent, AgentTransaction, AgentRequest, PlayerAgentRequest, UserProfile } from './types/game';
import toast, { Toaster } from 'react-hot-toast';
import { userErrorMessage } from './utils/userError';
import {
    Wallet,
    TrendingUp,
    Users,
    Copy,
    Check,
    Search,
    RefreshCw,
    LogOut,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    DollarSign,
    Filter,
    Sparkles,
    AlertCircle,
    ChevronRight,
    ChevronLeft,
    PlusCircle,
    Layers,
    Send,
    Info,
    CreditCard,
    ShieldCheck,
    History as HistoryIcon,
    Eye,
    EyeOff,
    X,
    UserCog,
    Save,
    Lock,
    MoreVertical,
    Languages
} from 'lucide-react';

// Transaction Detail Modal Component
const TransactionDetailModal: React.FC<{ transaction: AgentTransaction; onClose: () => void }> = ({ transaction, onClose }) => {
    const [copiedId, setCopiedId] = useState(false);

    const handleCopyId = () => {
        navigator.clipboard.writeText(transaction.id);
        setCopiedId(true);
        toast.success('Transaction ID copied!');
        setTimeout(() => setCopiedId(false), 2000);
    };

    const isPositive = transaction.amount >= 0 && (transaction.type === 'PlayerDeposit' || (transaction.type as string) === 'deposit' || transaction.type === 'FloatPurchase');

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 p-6 rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden text-slate-100">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-500" />
                
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className={`p-3 rounded-xl ${isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {isPositive ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-100">Transaction Details</h3>
                        <p className="text-xs text-slate-400">Recorded on {new Date(transaction.timestamp).toLocaleString()}</p>
                    </div>
                </div>

                <div className="space-y-4 bg-slate-850/60 p-4 rounded-xl border border-slate-800 text-sm">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                        <span className="text-slate-400">Transaction ID</span>
                        <div className="flex items-center gap-2 font-mono text-xs text-purple-300">
                            <span>{transaction.id.slice(0, 12)}...</span>
                            <button onClick={handleCopyId} className="p-1 hover:text-white text-slate-400 transition-colors">
                                {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                        <span className="text-slate-400">Type</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            isPositive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}>
                            {transaction.type}
                        </span>
                    </div>

                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                        <span className="text-slate-400">Amount</span>
                        <span className="text-lg font-bold font-mono text-slate-100">{transaction.amount < 0 ? '-' : ''}${Math.abs(transaction.amount).toFixed(2)}</span>
                    </div>

                    {transaction.discountAmount !== undefined && transaction.discountAmount > 0 && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                            <span className="text-slate-400">Commission Discount</span>
                            <span className="font-mono text-emerald-400 font-semibold">${transaction.discountAmount.toFixed(2)}</span>
                        </div>
                    )}

                    {transaction.playerName && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                            <span className="text-slate-400">Player Name</span>
                            <span className="font-semibold text-slate-200">{transaction.playerName}</span>
                        </div>
                    )}

                    {transaction.playerId && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                            <span className="text-slate-400">Player ID</span>
                            <span className="font-mono text-xs text-slate-300">{transaction.playerId}</span>
                        </div>
                    )}

                    {transaction.description && (
                        <div>
                            <span className="text-slate-400 block mb-1">Description</span>
                            <p className="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                                {transaction.description}
                            </p>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold py-2.5 rounded-xl transition-all border border-slate-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const AgentDashboard = () => {
    // Core state
    const [agent, setAgent] = useState<Agent | null>(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [transactions, setTransactions] = useState<AgentTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [requestAmount, setRequestAmount] = useState('');
    const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
    const [playerRequests, setPlayerRequests] = useState<PlayerAgentRequest[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [requestPage, setRequestPage] = useState(1);
    const [lastFetchedRequestIds, setLastFetchedRequestIds] = useState<Set<string>>(new Set());
    const [selectedTransaction, setSelectedTransaction] = useState<AgentTransaction | null>(null);
    const [paymentInstructions, setPaymentInstructions] = useState('');
    const [cashToSend, setCashToSend] = useState(0);
    const [linkedPlayers, setLinkedPlayers] = useState<UserProfile[]>([]);

    // Navigation and filtering state
    const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'requestFloat' | 'players' | 'history' | 'floatHistory' | 'settings'>('overview');
    const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'deposit' | 'withdrawal' | 'approved' | 'rejected'>('all');
    const [requestSearch, setRequestSearch] = useState('');
    const [playerSearch, setPlayerSearch] = useState('');
    const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
    const [copiedPromo, setCopiedPromo] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [profileForm, setProfileForm] = useState({ username: '', phone: '', location: '', currentPassword: '', newPassword: '', confirmPassword: '' });
    const [savingProfile, setSavingProfile] = useState(false);
    const [detectingLocation, setDetectingLocation] = useState(false);
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
    const [language, setLanguage] = useState<'en' | 'so'>(() => localStorage.getItem('app_language') === 'so' ? 'so' : 'en');
    const text = (english: string, somali: string) => language === 'so' ? somali : english;

    const ITEMS_PER_PAGE = 10;

    // Commission Cash calculation
    useEffect(() => {
        if (agent && requestAmount) {
            const amount = parseFloat(requestAmount);
            if (!isNaN(amount) && amount > 0) {
                const cash = amount * (1 - (agent.commissionRate || 0));
                setCashToSend(cash);
            } else {
                setCashToSend(0);
            }
        } else {
            setCashToSend(0);
        }
    }, [requestAmount, agent]);

    // Copy promo code
    const handleCopyPromo = () => {
        if (agent?.promoCode) {
            navigator.clipboard.writeText(agent.promoCode);
            setCopiedPromo(true);
            toast.success(`Promo Code "${agent.promoCode}" copied!`);
            setTimeout(() => setCopiedPromo(false), 2000);
        }
    };

    // API calls
    const fetchLinkedPlayers = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/my-players?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch linked players');
            const data = await response.json();
            setLinkedPlayers(data || []);
        } catch (err: any) {
            console.error('Error fetching linked players:', err.message);
        }
    };

    const fetchPaymentInstructions = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/payment-instructions?agentId=${agentId}`);
            if (!response.ok) return;
            const data = await response.json();
            setPaymentInstructions(data.instructions || '');
        } catch (err) {
            console.error('Error fetching payment instructions:', err);
        }
    };

    const fetchAgentRequests = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/requests?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch float requests');
            const data = await response.json();
            setAgentRequests(data || []);
        } catch (err: any) {
            console.error('Error fetching float requests:', err.message);
        }
    };

    const fetchPlayerRequests = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/player-requests?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch player requests');
            const data: PlayerAgentRequest[] = await response.json();
            
            const currentPendingRequestIds = new Set(data.filter(req => req.status === 'pending').map(req => req.id));
            
            if (lastFetchedRequestIds.size > 0) {
                const newRequestIds = [...currentPendingRequestIds].filter(id => !lastFetchedRequestIds.has(id));
                if (newRequestIds.length > 0) {
                    toast.success(`You have ${newRequestIds.length} new player transaction request(s)!`, {
                        icon: '🔔',
                        duration: 5000,
                    });
                }
            }
    
            setLastFetchedRequestIds(currentPendingRequestIds);
            setPlayerRequests(data || []);
        } catch (err: any) {
            console.error('Error polling player requests:', err.message);
        }
    };

    const fetchTransactions = async (agentId: string) => {
        try {
            const response = await fetch(`/api/agent/transactions?agentId=${agentId}`);
            if (!response.ok) throw new Error('Failed to fetch transactions');
            const data = await response.json();
            setTransactions(data || []);
        } catch (err: any) {
            console.error('Error fetching transactions:', err.message);
        }
    };

    const fetchProfile = async (agentId: string, showToast = false) => {
        setRefreshing(true);
        try {
            const response = await fetch(`/api/agent/profile?agentId=${agentId}`);
            if (!response.ok) {
                handleLogout();
                throw new Error('Session expired or invalid.');
            }
            const data = await response.json();
            setAgent(data);
            setProfileForm(current => ({ ...current, username: data.username || '', phone: data.phone || '', location: data.location || '' }));
            setIsLoggedIn(true);
            
            await Promise.all([
                fetchTransactions(data.id),
                fetchAgentRequests(data.id),
                fetchPaymentInstructions(data.id),
                fetchLinkedPlayers(data.id)
            ]);

            if (showToast) {
                toast.success('Dashboard refreshed');
            }
        } catch (err: any) {
            setError(userErrorMessage(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Actions
    const handleApprove = async (requestId: string) => {
        const agentId = localStorage.getItem('agentId');
        if (!agentId) return;
        setActionLoadingId(requestId);
        try {
            const response = await fetch(`/api/agent/player-requests/${requestId}/approve?agentId=${agentId}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to approve request');
            
            toast.success('Request approved successfully!');
            await fetchPlayerRequests(agentId);
            await fetchProfile(agentId);
        } catch (err: any) {
            toast.error(userErrorMessage(err, 'Request could not be approved.'));
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        const agentId = localStorage.getItem('agentId');
        if (!agentId) return;
        setActionLoadingId(requestId);
        try {
            const response = await fetch(`/api/agent/player-requests/${requestId}/reject?agentId=${agentId}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to reject request');
            
            toast.success('Request rejected');
            await fetchPlayerRequests(agentId);
        } catch (err: any) {
            toast.error(userErrorMessage(err, 'Request could not be rejected.'));
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleRequestFloat = async (e: React.FormEvent) => {
        e.preventDefault();
        const agentId = localStorage.getItem('agentId');
        if (!requestAmount || parseFloat(requestAmount) <= 0 || !agentId) {
            toast.error('Please enter a valid float amount to request.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/agent/request-float?agentId=${agentId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: requestAmount }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Float request failed');
            
            toast.success(`Float request for $${parseFloat(requestAmount).toFixed(2)} submitted!`);
            await fetchAgentRequests(agentId);
            setRequestAmount('');
            setActiveTab('floatHistory');
        } catch (err: any) {
            toast.error(userErrorMessage(err, 'Float request could not be sent.'));
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
                throw new Error(data.error || 'Invalid credentials');
            }
            localStorage.setItem('agentId', data.agent.id);
            setAgent(data.agent);
            setIsLoggedIn(true);
            toast.success(`Welcome back, ${data.agent.username}!`);
            await fetchProfile(data.agent.id);
        } catch (err: any) {
            setError(userErrorMessage(err, 'Sign-in failed.'));
            toast.error(userErrorMessage(err, 'Sign-in failed.'));
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
        toast.success('Logged out successfully');
    };

    const toggleAgentLanguage = () => {
        const nextLanguage = language === 'en' ? 'so' : 'en';
        setLanguage(nextLanguage);
        localStorage.setItem('app_language', nextLanguage);
        setHeaderMenuOpen(false);
        toast.success(nextLanguage === 'so' ? 'Luuqadda waxaa loo beddelay Soomaali' : 'Language changed to English');
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agent) return;
        if (!profileForm.currentPassword) {
            toast.error('Enter your current password to save changes.');
            return;
        }
        setSavingProfile(true);
        try {
            const response = await fetch(`/api/agent/profile?agentId=${agent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileForm),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to update profile.');
            setAgent(data.agent);
            setProfileForm(current => ({ ...current, username: data.agent.username || '', phone: data.agent.phone || '', location: data.agent.location || '', currentPassword: '', newPassword: '', confirmPassword: '' }));
            toast.success(data.message || 'Profile updated successfully.');
        } catch (err: any) {
            toast.error(userErrorMessage(err, 'Profile could not be updated.'));
        } finally {
            setSavingProfile(false);
        }
    };

    const handleDetectLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Location detection is not supported by this browser.');
            return;
        }
        setDetectingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async position => {
                try {
                    if (!agent) return;
                    const response = await fetch(`/api/agent/location?agentId=${agent.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
                    });
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('application/json')) {
                        throw new Error('Location API is unavailable. Please refresh after the server restarts.');
                    }
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Unable to save detected location.');
                    setAgent(data.agent);
                    setProfileForm(current => ({ ...current, location: data.agent.location || '' }));
                    toast.success(`Location updated: ${data.agent.location}`);
                } catch (err: any) {
                    toast.error(userErrorMessage(err, 'Location could not be saved.'));
                } finally {
                    setDetectingLocation(false);
                }
            },
            error => {
                setDetectingLocation(false);
                toast.error(error.code === error.PERMISSION_DENIED ? 'Please allow location access in your browser.' : 'Unable to detect your location. Please try again.');
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 }
        );
    };

    // Initial auth check
    useEffect(() => {
        const storedAgentId = localStorage.getItem('agentId');
        if (storedAgentId) {
            fetchProfile(storedAgentId);
        } else {
            setLoading(false);
        }
    }, []);

    // Polling player requests every 5s
    useEffect(() => {
        const agentId = agent?.id;
        if (isLoggedIn && agentId) {
            fetchPlayerRequests(agentId);
            const intervalId = setInterval(() => {
                fetchPlayerRequests(agentId);
            }, 5000);
            return () => clearInterval(intervalId);
        }
    }, [isLoggedIn, agent?.id]);

    // Computed Stats & Filtering
    const pendingRequestsCount = useMemo(() => {
        return playerRequests.filter(req => req.status === 'pending').length;
    }, [playerRequests]);

    const filteredPlayerRequests = useMemo(() => {
        return playerRequests.filter(req => {
            const matchesFilter = 
                requestFilter === 'all' ? true :
                requestFilter === 'pending' ? req.status === 'pending' :
                requestFilter === 'approved' ? req.status === 'approved' :
                requestFilter === 'rejected' ? req.status === 'rejected' :
                requestFilter === 'deposit' ? req.type === 'deposit' :
                requestFilter === 'withdrawal' ? (req.type === 'withdrawal' || req.type === 'withdraw') : true;

            const query = requestSearch.toLowerCase().trim();
            const matchesSearch = !query || 
                req.playerUsername.toLowerCase().includes(query) ||
                (req.playerPhone && req.playerPhone.includes(query)) ||
                (req.senderPhone && req.senderPhone.includes(query)) ||
                (req.provider && req.provider.toLowerCase().includes(query));

            return matchesFilter && matchesSearch;
        });
    }, [playerRequests, requestFilter, requestSearch]);

    const REQUESTS_PER_PAGE = 15;
    const totalRequestPages = Math.ceil(filteredPlayerRequests.length / REQUESTS_PER_PAGE) || 1;
    const currentPlayerRequests = useMemo(() => {
        const start = (requestPage - 1) * REQUESTS_PER_PAGE;
        return filteredPlayerRequests.slice(start, start + REQUESTS_PER_PAGE);
    }, [filteredPlayerRequests, requestPage]);

    useEffect(() => setRequestPage(1), [requestFilter, requestSearch]);
    useEffect(() => {
        if (requestPage > totalRequestPages) setRequestPage(totalRequestPages);
    }, [requestPage, totalRequestPages]);

    const filteredLinkedPlayers = useMemo(() => {
        const query = playerSearch.toLowerCase().trim();
        if (!query) return linkedPlayers;
        return linkedPlayers.filter(p => 
            p.username.toLowerCase().includes(query) || 
            (p.phone && p.phone.includes(query)) ||
            (p.id && p.id.includes(query))
        );
    }, [linkedPlayers, playerSearch]);

    const totalLinkedPlayerBalance = useMemo(() => {
        return linkedPlayers.reduce((acc, p) => acc + (p.balance || 0), 0);
    }, [linkedPlayers]);

    const filteredTransactions = useMemo(() => {
        if (txTypeFilter === 'all') return transactions;
        return transactions.filter(tx => tx.type === txTypeFilter);
    }, [transactions, txTypeFilter]);

    const totalTxPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1;
    const currentTransactions = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredTransactions.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredTransactions, currentPage]);

    // Preset float amounts helper
    const handleSetPresetAmount = (amt: number) => {
        setRequestAmount(amt.toString());
    };

    // Render Login Screen if not authenticated
    if (loading && !isLoggedIn) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-16 h-16">
                        <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 animate-ping" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-purple-500 border-r-transparent border-b-indigo-500 border-l-transparent animate-spin" />
                        <ShieldCheck className="w-8 h-8 text-purple-400 absolute inset-0 m-auto" />
                    </div>
                    <p className="text-slate-400 font-medium text-sm animate-pulse">Loading Agent Portal...</p>
                </div>
            </div>
        );
    }

    if (!isLoggedIn || !agent) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden text-slate-100">
                <Toaster position="top-center" />
                
                {/* Background decorative glows */}
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

                <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-purple-600 to-indigo-600 rounded-2xl shadow-lg shadow-purple-500/30 mb-4 border border-purple-400/30">
                            <ShieldCheck className="w-9 h-9 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-indigo-300 to-emerald-400 bg-clip-text text-transparent">
                            Agent Dashboard
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">Authorized Agent Login Portal</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2.5">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                                Agent Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter username"
                                className="w-full bg-slate-950/80 text-slate-100 px-4 py-3 rounded-xl border border-slate-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder:text-slate-600 text-sm"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className="w-full bg-slate-950/80 text-slate-100 px-4 py-3 rounded-xl border border-slate-800 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all placeholder:text-slate-600 text-sm pr-11"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <button 
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-purple-600/30 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm mt-2"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>Authenticating...</span>
                                </>
                            ) : (
                                <>
                                    <span>Sign In to Dashboard</span>
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-xs text-slate-500 border-t border-slate-800/80 pt-4">
                        Contact platform support if you forgot your credentials or need agent status assistance.
                    </div>
                </div>
            </div>
        );
    }

    // Main Authenticated Dashboard Layout
    return (
        <div className="bg-slate-950 text-slate-100 min-h-screen font-sans selection:bg-purple-500 selection:text-white">
            <Toaster position="top-right" />

            {/* Top Navigation Bar */}
            <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8 py-3.5">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
                    
                    {/* Brand */}
                    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        <img src="/ludosom-logo.png" alt="LudoSom" className="hidden h-10 w-10 shrink-0 rounded-xl object-cover shadow-lg shadow-purple-600/20 ring-1 ring-yellow-400/40 sm:block" />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="truncate text-sm font-bold bg-gradient-to-r from-purple-400 to-indigo-300 bg-clip-text text-transparent sm:text-lg">
                                    Agent Portal
                                </h1>
                                <span className="hidden px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full sm:flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Active
                                </span>
                            </div>
                            <p className="flex max-w-32 items-center gap-1 truncate text-[10px] text-slate-400 sm:max-w-none sm:text-xs">
                                <span>{agent.username}</span>
                                {agent.location && <span className="hidden truncate text-slate-500 md:inline">• {agent.location}</span>}
                            </p>
                        </div>
                    </div>

                    {/* Quick Stats Header Actions */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-right sm:px-3">
                            <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:block">{language === 'so' ? 'Haraaga' : 'Balance'}</span>
                            <span className="block text-xs font-extrabold font-mono text-emerald-400 sm:text-sm">${(agent.floatBalance ?? agent.balance ?? 0).toFixed(2)}</span>
                        </div>
                        {/* Refresh button */}
                        <button
                            onClick={() => fetchProfile(agent.id, true)}
                            disabled={refreshing}
                            className="p-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 transition-all flex items-center gap-2 text-xs font-medium"
                            title={text('Refresh Dashboard', 'Cusbooneysii Dashboard-ka')}
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-purple-400' : ''}`} />
                            <span className="hidden sm:inline">{text('Refresh', 'Cusbooneysii')}</span>
                        </button>

                        <div className="relative">
                            <button onClick={() => setHeaderMenuOpen(open => !open)} className="rounded-xl border border-slate-700/80 bg-slate-800/80 p-2.5 text-slate-300 transition-all hover:bg-slate-800 hover:text-white" aria-label="Open account menu">
                                <MoreVertical className="h-4 w-4" />
                            </button>
                            {headerMenuOpen && <>
                                <button className="fixed inset-0 z-40 cursor-default" onClick={() => setHeaderMenuOpen(false)} aria-label="Close account menu" />
                                <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-2xl">
                                    <button onClick={() => { setActiveTab('settings'); setHeaderMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800"><UserCog className="h-4 w-4 text-purple-400" />{language === 'so' ? 'Dejinta Profile-ka' : 'Profile Settings'}</button>
                                    <button onClick={toggleAgentLanguage} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-slate-800"><Languages className="h-4 w-4 text-blue-400" />{language === 'so' ? 'U beddel English' : 'U beddel Soomaali'}</button>
                                    <div className="my-1 border-t border-slate-800" />
                                    <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-400 hover:bg-red-500/10"><LogOut className="h-4 w-4" />{language === 'so' ? 'Ka bax' : 'Logout'}</button>
                                </div>
                            </>}
                        </div>
                    </div>

                </div>
            </header>

            {/* Sub-header Navigation Tabs */}
            <div className="bg-slate-900/50 border-b border-slate-800/60 px-4 lg:px-8">
                <div className="max-w-7xl mx-auto py-2">
                    <label className="sm:hidden block">
                        <span className="sr-only">{text('Choose dashboard section', 'Dooro qaybta dashboard-ka')}</span>
                        <select
                            value={activeTab}
                            onChange={e => setActiveTab(e.target.value as typeof activeTab)}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-purple-500"
                        >
                            <option value="overview">{text('Overview', 'Guudmar')}</option>
                            <option value="requests">{text('Player Requests', 'Codsiyada Ciyaartoyda')}{pendingRequestsCount ? ` (${pendingRequestsCount})` : ''}</option>
                            <option value="requestFloat">{text('Request Float', 'Codso Float')}</option>
                            <option value="players">{text('My Players', 'Ciyaartoydayda')} ({linkedPlayers.length})</option>
                            <option value="history">{text('Transaction History', 'Taariikhda Dhaqdhaqaaqa')}</option>
                            <option value="floatHistory">{text('Float Requests Log', 'Diiwaanka Codsiyada Float')}</option>
                            <option value="settings">{text('Profile Settings', 'Dejinta Profile-ka')}</option>
                        </select>
                    </label>
                    <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-none text-xs font-medium">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'overview'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        <span>{text('Overview', 'Guudmar')}</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap relative ${
                            activeTab === 'requests'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <CreditCard className="w-4 h-4" />
                        <span>{text('Player Requests', 'Codsiyada Ciyaartoyda')}</span>
                        {pendingRequestsCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-bounce">
                                {pendingRequestsCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('requestFloat')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'requestFloat'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <PlusCircle className="w-4 h-4" />
                        <span>{text('Request Float', 'Codso Float')}</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('players')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'players'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        <span>{text('My Players', 'Ciyaartoydayda')} ({linkedPlayers.length})</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'history'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <HistoryIcon className="w-4 h-4" />
                        <span>{text('Transaction History', 'Taariikhda Dhaqdhaqaaqa')}</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('floatHistory')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'floatHistory'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <Clock className="w-4 h-4" />
                        <span>{text('Float Requests Log', 'Diiwaanka Codsiyada Float')}</span>
                    </button>

                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                            activeTab === 'settings'
                                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                    >
                        <UserCog className="w-4 h-4" />
                        <span>{text('Profile Settings', 'Dejinta Profile-ka')}</span>
                    </button>
                    </div>
                </div>
            </div>

            {/* Main Content Body */}
            <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6">

                {/* Top Metrics Cards Grid */}
                {activeTab === 'overview' && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* Float Balance Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl group-hover:bg-emerald-500/20 transition-all" />
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{text('Available Float', 'Float-ka La Heli Karo')}</span>
                                <h3 className="text-2xl lg:text-3xl font-extrabold font-mono text-emerald-400 mt-1">
                                    ${(agent.floatBalance ?? agent.balance ?? 0).toFixed(2)}
                                </h3>
                            </div>
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                                <Wallet className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80 text-slate-400">
                            <span>{text('Ready for player deposits', 'Diyaar u ah dhigaalka ciyaartoyda')}</span>
                            <button
                                onClick={() => setActiveTab('requestFloat')}
                                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                            >
                                {text('Top Up', 'Ku Shubo')} <ChevronRight className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    {/* Commission Rate Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{text('Commission Rate', 'Heerka Komishanka')}</span>
                                <h3 className="text-2xl lg:text-3xl font-extrabold font-mono text-purple-400 mt-1">
                                    {((agent.commissionRate || 0) * 100).toFixed(1)}%
                                </h3>
                            </div>
                            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="text-xs pt-2 border-t border-slate-800/80 text-slate-400">
                            {text('Discount on float purchases', 'Qiimo-dhimista iibsiga float-ka')}
                        </div>
                    </div>

                    {/* Pending Player Requests Card */}
                    <div 
                        onClick={() => setActiveTab('requests')}
                        className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition-all rounded-2xl p-5 shadow-xl relative overflow-hidden group"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{text('Pending Player Requests', 'Codsiyada Ciyaartoyda ee Sugaya')}</span>
                                <h3 className="text-2xl lg:text-3xl font-extrabold font-mono text-amber-400 mt-1 flex items-center gap-2">
                                    <span>{pendingRequestsCount}</span>
                                    {pendingRequestsCount > 0 && (
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                                    )}
                                </h3>
                            </div>
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                                <Clock className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="text-xs pt-2 border-t border-slate-800/80 text-slate-400 flex items-center justify-between">
                            <span>{text('Requires your review', 'Waxay sugayaan hubintaada')}</span>
                            <span className="text-amber-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-semibold">
                                {text('View', 'Eeg')} <ChevronRight className="w-3 h-3" />
                            </span>
                        </div>
                    </div>

                    {/* Promo Code Quick Share Card */}
                    <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <span className="text-xs uppercase tracking-wider text-indigo-300 font-semibold">{text('My Promo Code', 'Promo Code-kayga')}</span>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="text-lg font-bold font-mono text-white bg-slate-900/80 px-3 py-1 rounded-lg border border-indigo-500/30">
                                        {agent.promoCode || 'N/A'}
                                    </span>
                                    {agent.promoCode && (
                                        <button
                                            onClick={handleCopyPromo}
                                            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow"
                                            title="Copy Promo Code"
                                        >
                                            {copiedPromo ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                                <Sparkles className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                            Players get auto-linked when registering with this code
                        </div>
                    </div>

                </div>}

                {/* Error Banner */}
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                            <span>{error}</span>
                        </div>
                        <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Quick Action Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Payment Instructions & Setup */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl">
                                            <Info className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-base font-bold text-slate-100">{text('Payment Instructions for Float', 'Tilmaamaha Bixinta Float-ka')}</h2>
                                    </div>
                                    <span className="text-xs text-slate-400">{text('Admin Instructions', 'Tilmaamaha Admin-ka')}</span>
                                </div>

                                {paymentInstructions ? (
                                    <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                                        {paymentInstructions}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-slate-400 text-xs italic text-center">
                                        No platform payment instructions configured by admin yet.
                                    </div>
                                )}

                                <div className="pt-2 flex justify-end">
                                    <button
                                        onClick={() => setActiveTab('requestFloat')}
                                        className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                                    >
                                        <span>Request Float Top-Up</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Linked Players Summary Card */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                                            <Users className="w-5 h-5" />
                                        </div>
                                        <h2 className="text-base font-bold text-slate-100">{text('Linked Players Overview', 'Guudmarka Ciyaartoyda Kugu Xiran')}</h2>
                                    </div>
                                    <span className="text-xs text-slate-400 font-mono font-semibold">
                                        Total: {linkedPlayers.length}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                                        <span className="text-xs text-slate-400 block">{text('Total Player Balances', 'Wadarta Haraaga Ciyaartoyda')}</span>
                                        <span className="text-lg font-bold font-mono text-emerald-400">${totalLinkedPlayerBalance.toFixed(2)}</span>
                                    </div>
                                    <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                                        <span className="text-xs text-slate-400 block">{text('Active Player Requests', 'Codsiyada Ciyaartoyda ee Firfircoon')}</span>
                                        <span className="text-lg font-bold font-mono text-amber-400">{pendingRequestsCount}</span>
                                    </div>
                                </div>

                                {/* Preview mini list */}
                                {linkedPlayers.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                                        {linkedPlayers.slice(0, 4).map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-base">{p.avatar || '👤'}</span>
                                                    <span className="font-semibold text-slate-200">{p.username}</span>
                                                </div>
                                                <span className="font-mono text-slate-300 font-medium">${(p.balance || 0).toFixed(2)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400 text-center py-4">No players linked to your promo code yet.</p>
                                )}

                                <div className="pt-2 flex justify-end">
                                    <button
                                        onClick={() => setActiveTab('players')}
                                        className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1"
                                    >
                                        View All Linked Players ({linkedPlayers.length}) <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                        </div>

                        {/* Recent Player Requests Section */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-4">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                        <span>Recent Player Requests</span>
                                        {pendingRequestsCount > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                                {pendingRequestsCount} Pending
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-slate-400">Incoming deposit and withdrawal requests from players</p>
                                </div>
                                <button
                                    onClick={() => setActiveTab('requests')}
                                    className="text-xs bg-slate-800 hover:bg-slate-700 px-3.5 py-2 rounded-xl text-slate-200 font-semibold transition-all border border-slate-700 flex items-center gap-1.5"
                                >
                                    <span>Manage All Requests</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Table */}
                            {playerRequests.length > 0 ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                                            <tr>
                                                <th className="px-4 py-3">Date</th>
                                                <th className="px-4 py-3">Player</th>
                                                <th className="px-4 py-3">Provider & Phone</th>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3 text-right">Amount</th>
                                                <th className="px-4 py-3 text-center">Status</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60">
                                            {playerRequests.slice(0, 5).map(req => (
                                                <tr key={req.id} className="hover:bg-slate-850/50 transition-colors">
                                                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                                                        {new Date(req.createdAt).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-slate-200">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-base">{req.playerAvatar || '👤'}</span>
                                                            <span>{req.playerUsername}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-slate-300">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-purple-300 uppercase text-[10px]">{req.provider || 'Mobile Money'}</span>
                                                            <span>{req.type === 'deposit' ? req.senderPhone : req.playerPhone}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                                            req.type === 'deposit'
                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                        }`}>
                                                            {req.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-100 text-sm">
                                                        ${req.amount.toFixed(2)}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                            req.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                            req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                                            'bg-red-500/20 text-red-300 border border-red-500/30'
                                                        }`}>
                                                            {req.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {req.status === 'pending' ? (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleApprove(req.id)}
                                                                    disabled={actionLoadingId === req.id}
                                                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                                                                >
                                                                    {actionLoadingId === req.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={() => handleReject(req.id)}
                                                                    disabled={actionLoadingId === req.id}
                                                                    className="bg-red-600 hover:bg-red-500 text-white px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                                                                >
                                                                    {actionLoadingId === req.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-500 text-[11px]">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-400 text-xs bg-slate-950/40 rounded-xl border border-slate-800">
                                    No player transaction requests received yet.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: PLAYER REQUESTS MANAGER */}
                {activeTab === 'requests' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <CreditCard className="w-5 h-5 text-purple-400" />
                                    <span>{text('Player Transaction Requests', 'Codsiyada Lacagta Ciyaartoyda')}</span>
                                </h2>
                                <p className="text-xs text-slate-400">{text('Review, approve, or decline deposit and withdrawal requests from players', 'Hubi, aqbal ama diid codsiyada dhigaalka iyo la-bixidda ciyaartoyda')}</p>
                            </div>

                            {/* Search bar */}
                            <div className="relative w-full md:w-64">
                                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={requestSearch}
                                    onChange={(e) => setRequestSearch(e.target.value)}
                                    placeholder="Search player, phone, provider..."
                                    className="w-full bg-slate-950 text-xs px-3.5 pl-9 py-2 rounded-xl border border-slate-800 focus:border-purple-500 outline-none text-slate-200"
                                />
                                {requestSearch && (
                                    <button onClick={() => setRequestSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Filter pills */}
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                            {[
                                { id: 'all', label: 'All Requests', count: playerRequests.length },
                                { id: 'pending', label: 'Pending', count: pendingRequestsCount },
                                { id: 'deposit', label: 'Deposits', count: playerRequests.filter(r => r.type === 'deposit').length },
                                { id: 'withdrawal', label: 'Withdrawals', count: playerRequests.filter(r => r.type === 'withdrawal' || r.type === 'withdraw').length },
                                { id: 'approved', label: 'Approved', count: playerRequests.filter(r => r.status === 'approved').length },
                                { id: 'rejected', label: 'Rejected', count: playerRequests.filter(r => r.status === 'rejected').length },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => { setRequestFilter(f.id as any); setRequestPage(1); }}
                                    className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap font-medium flex items-center gap-1.5 ${
                                        requestFilter === f.id
                                            ? 'bg-purple-600 text-white font-semibold shadow'
                                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                                    }`}
                                >
                                    <span>{f.label}</span>
                                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                                        requestFilter === f.id ? 'bg-purple-800 text-white' : 'bg-slate-800 text-slate-400'
                                    }`}>
                                        {f.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Requests Table */}
                        {filteredPlayerRequests.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3.5">Date & Time</th>
                                            <th className="px-4 py-3.5">Player Info</th>
                                            <th className="px-4 py-3.5">Payment Details</th>
                                            <th className="px-4 py-3.5">Type</th>
                                            <th className="px-4 py-3.5 text-right">Amount</th>
                                            <th className="px-4 py-3.5 text-center">Status</th>
                                            <th className="px-4 py-3.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
                                        {currentPlayerRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-slate-850/60 transition-colors">
                                                <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">
                                                    {new Date(req.createdAt).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-xl bg-slate-800 p-1 rounded-lg">{req.playerAvatar || '👤'}</span>
                                                        <div>
                                                            <div className="font-semibold text-slate-100">{req.playerUsername}</div>
                                                            <div className="text-[10px] text-slate-500 font-mono">ID: {req.playerId}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="font-mono text-slate-200">
                                                        <div className="font-bold text-purple-300 uppercase text-[10px]">{req.provider || 'Mobile Wallet'}</div>
                                                        <div className="text-xs">{req.type === 'deposit' ? req.senderPhone : req.playerPhone}</div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                                                        req.type === 'deposit'
                                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {req.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right font-mono font-extrabold text-slate-100 text-sm">
                                                    ${req.amount.toFixed(2)}
                                                    {(req.type === 'withdrawal' || req.type === 'withdraw') && <span className="block text-[10px] font-semibold text-amber-300">Fee ${Number(req.fee || 0).toFixed(2)} · Pay ${Number(req.netAmount ?? req.amount).toFixed(2)}</span>}
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                        req.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                        req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                                        'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3.5 text-right">
                                                    {req.status === 'pending' ? (
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => handleApprove(req.id)}
                                                                disabled={actionLoadingId === req.id}
                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow flex items-center gap-1 disabled:opacity-50"
                                                            >
                                                                {actionLoadingId === req.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                                Approve
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(req.id)}
                                                                disabled={actionLoadingId === req.id}
                                                                className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow flex items-center gap-1 disabled:opacity-50"
                                                            >
                                                                {actionLoadingId === req.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                                                Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-500 text-xs">Processed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {totalRequestPages > 1 && (
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/60 px-4 py-3">
                                        <span className="text-[11px] text-slate-400">
                                            {text('Showing', 'Waxaa muuqda')} {(requestPage - 1) * REQUESTS_PER_PAGE + 1}–{Math.min(requestPage * REQUESTS_PER_PAGE, filteredPlayerRequests.length)} {text('of', 'oo ka mid ah')} {filteredPlayerRequests.length}
                                        </span>
                                        <div className="flex flex-wrap items-center justify-end gap-1">
                                            <button onClick={() => setRequestPage(page => Math.max(1, page - 1))} disabled={requestPage === 1} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40">‹</button>
                                            {Array.from({ length: totalRequestPages }, (_, index) => index + 1).map(page => (
                                                <button key={page} onClick={() => setRequestPage(page)} className={`min-w-8 rounded-lg px-2 py-1.5 text-xs font-bold ${requestPage === page ? 'bg-purple-600 text-white' : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{page}</button>
                                            ))}
                                            <button onClick={() => setRequestPage(page => Math.min(totalRequestPages, page + 1))} disabled={requestPage === totalRequestPages} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40">›</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
                                <CreditCard className="w-10 h-10 text-slate-600 mx-auto" />
                                <p className="text-sm font-medium text-slate-300">No requests found matching criteria</p>
                                <p className="text-xs text-slate-500">Try adjusting your filters or search keywords.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 3: REQUEST FLOAT */}
                {activeTab === 'requestFloat' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        
                        {/* Form & Calculator */}
                        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                            <div>
                                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <PlusCircle className="w-5 h-5 text-purple-400" />
                                    <span>{text('Request Float Top-Up', 'Codso Kordhinta Float-ka')}</span>
                                </h2>
                                <p className="text-xs text-slate-400">{text('Request additional float balance from admin to process player deposits', 'Admin-ka ka codso float dheeraad ah si aad u fuliso dhigaalka ciyaartoyda')}</p>
                            </div>

                            {/* Preset Buttons */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                    Quick Select Amount
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {[50, 100, 200, 500, 1000].map(amt => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => handleSetPresetAmount(amt)}
                                            className={`py-2 px-1 rounded-xl font-mono text-xs font-bold transition-all border ${
                                                requestAmount === amt.toString()
                                                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30'
                                                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-purple-500/50'
                                            }`}
                                        >
                                            ${amt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <form onSubmit={handleRequestFloat} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                        Float Amount Requested ($)
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="w-5 h-5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="number"
                                            value={requestAmount}
                                            onChange={(e) => setRequestAmount(e.target.value)}
                                            placeholder="Enter amount (e.g. 100)"
                                            min="1"
                                            step="any"
                                            className="w-full bg-slate-950 text-slate-100 pl-10 pr-4 py-3 rounded-xl border border-slate-800 focus:border-purple-500 outline-none text-base font-mono font-bold"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Calculation Box */}
                                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                                    <div className="flex justify-between text-slate-400">
                                        <span>Your Agent Commission Rate:</span>
                                        <span className="font-mono text-slate-200 font-semibold">{((agent.commissionRate || 0) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Commission Discount Savings:</span>
                                        <span className="font-mono text-emerald-400 font-semibold">
                                            -${((parseFloat(requestAmount) || 0) * (agent.commissionRate || 0)).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-800 text-purple-300">
                                        <span>Net Cash to Send Admin:</span>
                                        <span className="font-mono text-xl text-emerald-400">${cashToSend.toFixed(2)}</span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !requestAmount || parseFloat(requestAmount) <= 0}
                                    className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    <span>Submit Float Request (${cashToSend.toFixed(2)})</span>
                                </button>
                            </form>
                        </div>

                        {/* Payment Instructions Card */}
                        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                            <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl">
                                    <Info className="w-5 h-5" />
                                </div>
                                <h3 className="text-base font-bold text-slate-100">Payment Instructions</h3>
                            </div>

                            {paymentInstructions ? (
                                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                                    {paymentInstructions}
                                </div>
                            ) : (
                                <div className="p-6 bg-slate-950/50 rounded-xl border border-slate-800 text-center text-xs text-slate-400 italic">
                                    No payment instructions available. Please contact an admin.
                                </div>
                            )}

                            <div className="p-4 bg-purple-950/20 border border-purple-500/20 rounded-xl text-xs text-purple-300 space-y-1">
                                <span className="font-bold block">💡 How Float Works:</span>
                                <p className="text-slate-400">
                                    After transferring cash to admin according to the instructions above, your float request will be approved and added directly to your Agent Float balance.
                                </p>
                            </div>
                        </div>

                    </div>
                )}

                {/* TAB 4: LINKED PLAYERS */}
                {activeTab === 'players' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-indigo-400" />
                                    <span>{text('My Linked Players', 'Ciyaartoyda Igu Xiran')}</span>
                                </h2>
                                <p className="text-xs text-slate-400">Players registered using your promo code ({agent.promoCode})</p>
                            </div>

                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={playerSearch}
                                    onChange={(e) => setPlayerSearch(e.target.value)}
                                    placeholder="Search player name..."
                                    className="w-full bg-slate-950 text-xs px-3.5 pl-9 py-2 rounded-xl border border-slate-800 focus:border-indigo-500 outline-none text-slate-200"
                                />
                                {playerSearch && (
                                    <button onClick={() => setPlayerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Stats Banner */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                                <span className="text-xs text-slate-400 block">{text('Total Linked Players', 'Wadarta Ciyaartoyda Kugu Xiran')}</span>
                                <span className="text-lg font-bold font-mono text-indigo-400">{linkedPlayers.length}</span>
                            </div>
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                                <span className="text-xs text-slate-400 block">{text('Combined Balance', 'Wadarta Haraaga')}</span>
                                <span className="text-lg font-bold font-mono text-emerald-400">${totalLinkedPlayerBalance.toFixed(2)}</span>
                            </div>
                            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 col-span-2 sm:col-span-1">
                                <span className="text-xs text-slate-400 block">{text('Your Promo Code', 'Promo Code-kaaga')}</span>
                                <span className="text-lg font-bold font-mono text-purple-400">{agent.promoCode || 'None'}</span>
                            </div>
                        </div>

                        {/* Players List */}
                        {filteredLinkedPlayers.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3">Player</th>
                                            <th className="px-4 py-3">User ID</th>
                                            <th className="px-4 py-3 text-right">Wallet Balance</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
                                        {filteredLinkedPlayers.map(player => (
                                            <tr key={player.id} className="hover:bg-slate-850/60 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-slate-100">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-xl bg-slate-800 p-1.5 rounded-xl">{player.avatar || '👤'}</span>
                                                        <span>{player.username}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">{player.id}</td>
                                                <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400 text-sm">
                                                    ${(player.balance || 0).toFixed(2)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
                                <Users className="w-10 h-10 text-slate-600 mx-auto" />
                                <p className="text-sm font-medium text-slate-300">No linked players found</p>
                                <p className="text-xs text-slate-500">Share your promo code "{agent.promoCode}" with players to link them to your dashboard.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 5: TRANSACTION HISTORY */}
                {activeTab === 'history' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <HistoryIcon className="w-5 h-5 text-purple-400" />
                                    <span>{text('Agent Transaction Log', 'Diiwaanka Dhaqdhaqaaqa Agent-ka')}</span>
                                </h2>
                                <p className="text-xs text-slate-400">{text('Complete record of deposits, withdrawals, and float purchases', 'Diiwaan buuxa oo dhigaal, la-bixid iyo iibsiga float-ka ah')}</p>
                            </div>

                            {/* Filter dropdown */}
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-slate-500" />
                                <select
                                    value={txTypeFilter}
                                    onChange={(e) => {
                                        setTxTypeFilter(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="bg-slate-950 text-xs px-3 py-2 rounded-xl border border-slate-800 focus:border-purple-500 text-slate-200 outline-none"
                                >
                                    <option value="all">All Types</option>
                                    <option value="FloatPurchase">Float Purchase</option>
                                    <option value="PlayerDeposit">Player Deposit</option>
                                    <option value="PlayerWithdrawal">Player Withdrawal</option>
                                </select>
                            </div>
                        </div>

                        {/* Transactions table */}
                        {currentTransactions.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3">Date</th>
                                            <th className="px-4 py-3">Type</th>
                                            <th className="px-4 py-3">Description</th>
                                            <th className="px-4 py-3 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
                                        {currentTransactions.map(tx => {
                                            const isDeduction = tx.amount < 0 || tx.type === 'PlayerDeposit' || (tx.type as string) === 'deposit';
                                            return (
                                                <tr
                                                    key={tx.id}
                                                    onClick={() => setSelectedTransaction(tx)}
                                                    className="hover:bg-slate-800/80 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                                                        {new Date(tx.timestamp).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                                            isDeduction
                                                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                        }`}>
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-300">{tx.description || '—'}</td>
                                                    <td className={`px-4 py-3 text-right font-mono font-bold text-sm ${
                                                        isDeduction ? 'text-red-400' : 'text-emerald-400'
                                                    }`}>
                                                        {isDeduction ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800">
                                No transactions found for selected filter.
                            </div>
                        )}

                        {/* Pagination */}
                        {totalTxPages > 1 && (
                            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                                <span className="text-slate-400">
                                    Showing page <strong className="text-slate-200">{currentPage}</strong> of <strong className="text-slate-200">{totalTxPages}</strong>
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 disabled:opacity-40"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalTxPages))}
                                        disabled={currentPage === totalTxPages}
                                        className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 disabled:opacity-40"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 6: FLOAT REQUEST HISTORY */}
                {activeTab === 'floatHistory' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-purple-400" />
                                    <span>{text('My Float Requests Log', 'Diiwaanka Codsiyadayda Float')}</span>
                                </h2>
                                <p className="text-xs text-slate-400">{text('History of float top-up requests submitted to platform admin', 'Taariikhda codsiyada kordhinta float-ka ee loo diray admin-ka')}</p>
                            </div>
                            <button
                                onClick={() => setActiveTab('requestFloat')}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-all shadow flex items-center gap-1.5"
                            >
                                <PlusCircle className="w-4 h-4" />
                                <span>{text('New Float Request', 'Codsi Float Cusub')}</span>
                            </button>
                        </div>

                        {agentRequests.length > 0 ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3">Date Submitted</th>
                                            <th className="px-4 py-3">Requested Amount</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3 text-right">Resolved Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/40">
                                        {agentRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-slate-850/60 transition-colors">
                                                <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">
                                                    {new Date(req.createdAt).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 font-mono font-bold text-slate-100 text-sm">
                                                    ${req.amount.toFixed(2)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                                                        req.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                                        req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                                        'bg-red-500/20 text-red-300 border border-red-500/30'
                                                    }`}>
                                                        {req.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-400 font-mono text-[11px]">
                                                    {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString() : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
                                <Clock className="w-10 h-10 text-slate-600 mx-auto" />
                                <p className="text-sm font-medium text-slate-300">No float requests recorded yet</p>
                                <p className="text-xs text-slate-500">Submit a request whenever you need to replenish your agent float balance.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="mx-auto max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
                        <div className="border-b border-slate-800 pb-4 mb-6">
                            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><UserCog className="w-5 h-5 text-purple-400" /> {text('Profile Settings', 'Dejinta Profile-ka')}</h2>
                            <p className="text-xs text-slate-400 mt-1">{text('Update your personal details or change your password.', 'Cusbooneysii xogtaada gaarka ah ama beddel password-kaaga.')}</p>
                        </div>
                        <form onSubmit={handleSaveProfile} className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="text-xs font-semibold text-slate-300">Username
                                    <input value={profileForm.username} onChange={e => setProfileForm({ ...profileForm, username: e.target.value })} minLength={3} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                                </label>
                                <label className="text-xs font-semibold text-slate-300">Phone
                                    <input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                                </label>
                                <div className="sm:col-span-2">
                                    <span className="text-xs font-semibold text-slate-300">{text('Location', 'Goobta')}</span>
                                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                        <div className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-300">{profileForm.location || 'Location not detected yet'}</div>
                                        <button type="button" onClick={handleDetectLocation} disabled={detectingLocation} className="rounded-xl border border-purple-500/40 bg-purple-500/10 px-4 py-2.5 text-sm font-bold text-purple-300 hover:bg-purple-500/20 disabled:opacity-60">
                                            {detectingLocation ? text('Detecting...', 'Waa la raadinayaa...') : text('Detect My Location', 'Ogow Goobtayda')}
                                        </button>
                                    </div>
                                    <p className="mt-2 text-xs text-slate-500">Your browser will ask permission and select the nearest supported service area.</p>
                                </div>
                            </div>
                            <div className="border-t border-slate-800 pt-5">
                                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-200"><Lock className="w-4 h-4 text-purple-400" /> {text('Password & Security', 'Password iyo Amniga')}</h3>
                                <p className="mt-1 text-xs text-slate-500">Leave the new password fields empty if you only want to update your profile.</p>
                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <label className="text-xs font-semibold text-slate-300 sm:col-span-2">Current Password
                                        <input type="password" value={profileForm.currentPassword} onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                                    </label>
                                    <label className="text-xs font-semibold text-slate-300">New Password
                                        <input type="password" value={profileForm.newPassword} onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })} minLength={6} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                                    </label>
                                    <label className="text-xs font-semibold text-slate-300">Confirm New Password
                                        <input type="password" value={profileForm.confirmPassword} onChange={e => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} minLength={6} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500" />
                                    </label>
                                </div>
                            </div>
                            <button type="submit" disabled={savingProfile} className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white transition-all">
                                {savingProfile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {text('Save Changes', 'Keydi Isbeddellada')}
                            </button>
                        </form>
                    </div>
                )}

            </main>

            {/* Modal for viewing detailed transaction info */}
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
