import React, { useState, useEffect, useCallback } from 'react';
import GameRoomComponent from '../components/GameRoom';
import AdminLayout from '../components/admin/AdminLayout';
import StatsGrid from '../components/admin/StatsGrid';
import UsersTable from '../components/admin/UsersTable';
import RoomsTable from '../components/admin/RoomsTable';
import TransactionsTable from '../components/admin/TransactionsTable';
import ManualTransactionsTable from '../components/admin/ManualTransactionsTable';
import AgentsTable from '../components/admin/AgentsTable';
import Settings from '../components/admin/Settings';
import UserEditModal from '../components/UserEditModal';
import CreateAgentModal from '../components/CreateAgentModal';
import EditAgentModal from '../components/EditAgentModal';
import CreditAgentModal from '../components/CreditAgentModal';
import EditRoleModal from '../components/EditRoleModal';
import { Agent, AgentRequest, ManualTransaction, UserProfile, Tournament, GameRoom } from '../types/game';
import AgentRequestsTable from '../components/admin/AgentRequestsTable';
import { TournamentsTable } from '../components/admin/TournamentsTable';
import toast, { Toaster } from 'react-hot-toast';
import { isFullAdmin } from '../utils/admin';
import ChangePasswordForm from '../components/ChangePasswordForm';

const VIEW_PERMISSIONS: Record<string, string> = {
    stats: 'stats', users: 'users', rooms: 'rooms', transactions: 'transactions',
    'manual-transactions': 'transactions', agents: 'agents', 'agent-requests': 'agents',
    tournaments: 'tournaments', settings: 'settings', 'my-settings': 'self',
};
const VIEW_ORDER = ['stats', 'users', 'rooms', 'transactions', 'manual-transactions', 'agents', 'agent-requests', 'tournaments', 'settings', 'my-settings'];

const canAccessView = (user: { username: string; role?: string; permissions?: string[] }, targetView: string) => {
    const permissions = user.permissions || [];
    return permissions.includes('all')
        || user.username === 'admin'
        || user.role === 'Super Admin'
        || VIEW_PERMISSIONS[targetView] === 'self'
        || permissions.includes(VIEW_PERMISSIONS[targetView]);
};

const getInitialView = (user: { username: string; role?: string; permissions?: string[] }) =>
    VIEW_ORDER.find(candidate => canAccessView(user, candidate)) || 'my-settings';

const AdminDashboard: React.FC = () => {
    // Define AdminUser interface to match backend
    interface AdminUser {
        id: string;
        username: string;
        permissions: string[];
        role?: string;
    }

    type AdminRole = {
        id: string;
        name: string;
        permissions: string[];
        status: 'active' | 'suspended';
    }
    
    const [adminUser, setAdminUser] = useState<AdminUser | null>(() => {
        const storedUser = localStorage.getItem('admin_user');
        try {
            return storedUser ? JSON.parse(storedUser) : null;
        } catch {
            return null;
        }
    });
    const adminId = adminUser?.id;
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'stats' | 'users' | 'rooms' | 'transactions' | 'manual-transactions' | 'agents' | 'tournaments' | 'settings' | 'agent-requests' | 'my-settings'>('stats');
    const [error, setError] = useState<string | null>(null);
    
    // Data states
    const [stats, setStats] = useState<any>(null);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [rooms, setRooms] = useState<GameRoom[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [manualTransactions, setManualTransactions] = useState<ManualTransaction[]>([]);
    const [paymentSettings, setPaymentSettings] = useState<any>(null);
    const [adminSettings, setAdminSettings] = useState<any>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [tournamentsList, setTournamentsList] = useState<Tournament[]>([]);
    const [agentRequests, setAgentRequests] = useState<AgentRequest[]>([]);
    const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

    useEffect(() => {
        if (!adminUser) return;
        if (canAccessView(adminUser, view)) return;
        setView(getInitialView(adminUser) as typeof view);
    }, [adminUser, view]);

    // Modal state
    const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [creditingAgent, setCreditingAgent] = useState<Agent | null>(null);
    const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
    const [isCreateAgentModalOpen, setCreateAgentModalOpen] = useState(false);
    const [isCreateRoleModalOpen, setCreateRoleModalOpen] = useState(false);
    const [spectatingRoomId, setSpectatingRoomId] = useState<string | null>(null);


    const permissionsList = ['stats', 'users', 'rooms', 'transactions', 'agents', 'tournaments', 'settings'];

    const handleLogout = () => {
        localStorage.removeItem('admin_user');
        setAdminUser(null);
    };
    
    const fetchAgentRequests = useCallback(async () => {
        if (!adminUser) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/agent-requests?userId=${adminUser.id}`);
            if (!response.ok) {
                let errMessage = 'Failed to fetch agent requests';
                try {
                    const err = await response.json();
                    errMessage = err.error || errMessage;
                } catch(e) { /* ignore json parsing error */ }
                
                if (response.status === 403 || response.status === 401) {
                    handleLogout(); // Log out if session is invalid
                }
                setError(errMessage);
                return;
            }
            const data = await response.json();
            setAgentRequests(data);
        } catch (err: any) {
            setError(err.message);
        }
    }, [adminUser]);

    const handleApproveAgentRequest = async (requestId: string) => {
        if (!adminUser) return;
        setProcessingRequestId(requestId);
        try {
            const response = await fetch(`/api/admin/agent-requests/${requestId}/approve?userId=${adminUser.id}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to approve request');
            await fetchAgentRequests();
            // Also refetch main data to update agent balances etc.
            if(view === 'agents') {
                fetchData('agents');
            } else if (view === 'stats') {
                fetchData('stats');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setProcessingRequestId(null);
        }
    };

    const handleRejectAgentRequest = async (requestId: string) => {
        if (!adminUser) return;
        setProcessingRequestId(requestId);
        try {
            const response = await fetch(`/api/admin/agent-requests/${requestId}/reject?userId=${adminUser.id}`, {
                method: 'POST',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to reject request');
            await fetchAgentRequests();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setProcessingRequestId(null);
        }
    };

    const fetchData = useCallback(async (type: 'stats' | 'users' | 'rooms' | 'transactions' | 'manual-transactions' | 'payment-settings' | 'agents' | 'tournaments' | 'settings' | 'agent-requests', showerror = true) => {
        if (!adminUser) return;
        if(showerror) setError(null);
        try {
            const response = await fetch(`/api/admin/${type}?userId=${adminUser.id}`);
            if (!response.ok) {
                let errMessage = `Failed to fetch ${type}`;
                try {
                    const err = await response.json();
                    errMessage = err.error || errMessage;
                } catch(e) { /* ignore json parsing error */ }

                if (response.status === 403 || response.status === 401) {
                    handleLogout(); // Log out if session is invalid
                }
                if(showerror) setError(errMessage);
                return;
            }
            const data = await response.json();
            switch (type) {
                case 'stats': setStats(data); break;
                case 'users': setUsers(data); break;
                case 'rooms': setRooms(data); break;
                case 'transactions': setTransactions(data); break;
                case 'manual-transactions': setManualTransactions(data); break;
                case 'payment-settings': setPaymentSettings(data); break;
                case 'agents': setAgents(data); break;
                case 'tournaments': setTournamentsList(data); break;
                case 'settings': setAdminSettings(data); break;
            }
        } catch (err: any) {
            if(showerror) setError(err.message);
        }
    }, [adminUser]);

    const handleAuth = async () => {
        setError(null);
        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!response.ok) {
                let errorMessage = 'Login failed. Please check credentials.';
                try {
                    const data = await response.json();
                    errorMessage = data.error || errorMessage;
                } catch (e) {
                    console.error("Failed to parse error response as JSON", e);
                }
                throw new Error(errorMessage);
            }
            const data = await response.json();
            if (data.success && data.user) {
                localStorage.setItem('admin_user', JSON.stringify(data.user));
                setView(getInitialView(data.user) as typeof view);
                setAdminUser(data.user);
            } else {
                throw new Error(data.error || 'Login failed');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };


    useEffect(() => {
        if (adminUser) {
            if (!canAccessView(adminUser, view)) return;
            if (view !== 'my-settings') fetchData(view);
            if (view === 'settings') {
                fetchData('payment-settings', false);
                fetchData('settings', false);
            }
            if (view === 'stats') {
                fetchData('rooms', false);
                fetchData('manual-transactions', false);
            }
            if (view === 'agent-requests') {
                fetchAgentRequests();
            }
        }
    }, [adminUser, view, fetchData]);

    useEffect(() => {
        if (!adminUser) return;

        const fetchAndNotify = async () => {
            try {
                const response = await fetch(`/api/admin/manual-transactions?userId=${adminUser.id}`);
                if (!response.ok) return;
                const data: ManualTransaction[] = await response.json();

                if (manualTransactions.length > 0) {
                    const existingIds = new Set(manualTransactions.map(tx => tx.id));
                    const newTransactions = data.filter(tx =>
                        !existingIds.has(tx.id) && tx.managedBy !== 'agent' && tx.status === 'pending'
                    );
                    if (newTransactions.length > 0) {
                        toast.success(`${newTransactions.length} new admin transaction request(s)!`);
                    }
                }
                
                setManualTransactions(data);

            } catch (err) {
                console.error("Polling for manual transactions failed", err);
            }
        };

        const intervalId = setInterval(() => {
            // Only poll if the user is on the manual-transactions tab
            // or on the main stats tab where manual transactions are shown.
            if (view === 'manual-transactions' || view === 'stats') {
                fetchAndNotify();
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(intervalId);
    }, [adminUser, view, manualTransactions]);
    
    const handleSaveUser = async (updatedData: Partial<UserProfile>) => {
        if (!editingUser || !adminUser) return;
        
        if (isFullAdmin(editingUser)) {
            setError('Full Admin users are protected and cannot be edited.');
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${editingUser.id}/update?userId=${adminUser.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to update user');
            }
            setEditingUser(null);
            fetchData('users'); // Refresh user list
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            throw err;
        }
    };
    
    const handleDeleteUser = async (userToDelete: UserProfile) => {
        if (isFullAdmin(userToDelete)) {
            setError('Full Admin users are protected and cannot be deleted.');
            return;
        }

        if (!adminUser || !window.confirm(`Are you sure you want to delete user ${userToDelete.username}? This action cannot be undone.`)) return;

        try {
            const response = await fetch(`/api/admin/users/${userToDelete.id}/delete?userId=${adminUser.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to delete user');
            }
            fetchData('users'); // Refresh user list
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleImpersonate = async (userToImpersonate: UserProfile) => {
        if (isFullAdmin(userToImpersonate)) {
            setError('Full Admin accounts are protected and cannot be impersonated.');
            return;
        }

        if (!adminUser || !window.confirm(`Are you sure you want to log in as ${userToImpersonate.username}?`)) return;

        try {
            const response = await fetch(`/api/admin/impersonate?userId=${adminUser.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: userToImpersonate.id }),
            });
            const data = await response.json();
            if (response.ok && data.success) {
                // Should recieve a JWT token
                localStorage.setItem('token', data.token);
                window.location.href = '/';
            } else {
                throw new Error(data.error || 'Impersonation failed');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };
    
    const handleCancelGame = async (roomId: string) => {
        if (!adminUser || !window.confirm(`Are you sure you want to cancel room ${roomId}?`)) return;

        try {
            const response = await fetch(`/api/admin/rooms/${roomId}/cancel?userId=${adminUser.id}`, {
                method: 'POST',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to cancel room');
            }
            fetchData('rooms'); // Refresh rooms list
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleSpectate = (roomId: string) => {
        setSpectatingRoomId(roomId);
    };

    const handleDeleteAgent = async (agentId: string) => {
        const targetAgent = agents.find(a => a.id === agentId);
        if (targetAgent && isFullAdmin(targetAgent)) {
            setError('Full Admin agents are protected and cannot be deleted.');
            return;
        }

        if (!adminId || !window.confirm('Are you sure you want to delete this agent? This action is irreversible.')) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/agents/${agentId}/delete?userId=${adminId}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to delete agent');
            }
            fetchData('agents');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleToggleAgentStatus = async (agent: Agent) => {
        if (!adminId) return;
        if (isFullAdmin(agent)) {
            setError('Full Admin agents are protected and cannot be suspended or blocked.');
            return;
        }
        const newStatus = agent.status === 'Active' ? 'Suspended' : 'Active';
        if (!window.confirm(`Are you sure you want to ${newStatus.toLowerCase()} agent ${agent.username}?`)) return;
        
        await handleUpdateAgent(agent.id, { status: newStatus });
    };

    const handleUpdateAgent = async (agentId: string, data: Partial<Agent>) => {
        if (!adminId) return;
        const targetAgent = agents.find(a => a.id === agentId);
        if (targetAgent && isFullAdmin(targetAgent)) {
            setError('Full Admin agents are protected and cannot be edited.');
            return;
        }
        setError(null);
        try {
            const response = await fetch(`/api/admin/agents/${agentId}/update?userId=${adminId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to update agent');
            }
            await fetchData('agents');
            setEditingAgent(null)
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            throw err;
        }
    };

    const handleCreateAgent = async (agentData: { username: string, password: string, commissionRate: string, location?: string, phone: string, promoCode?: string }) => {
        if (!adminId) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/agents/create?userId=${adminId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(agentData),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to create agent');
            }
            await fetchData('agents');
            setCreateAgentModalOpen(false);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            throw err;
        }
    };

    const handleCreditAgent = async (agentId: string, amount: number, discount: number) => {
        if (!adminId) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/agents/${agentId}/credit?userId=${adminId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, discount }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to credit agent');
            }
            await fetchData('agents');
            setCreditingAgent(null);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            throw err;
        }
    };

    const handleCreateRole = async (roleData: { name: string, permissions: string[]}) => {
        if (!adminUser) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/roles/create?userId=${adminUser.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roleData),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to create role');
            }
            await fetchData('settings');
            setCreateRoleModalOpen(false)
        } catch (err: any) {
            setError(err.message);
            throw err
        }
    };

    const handleDeleteRole = async (role: AdminRole) => {
        if (isFullAdmin(role)) {
            setError('Full Admin role is protected and cannot be deleted.');
            return;
        }

        if (!adminUser || !window.confirm(`Are you sure you want to delete the role "${role.name}"?`)) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/roles/${role.id}/delete?userId=${adminUser.id}`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to delete role');
            }
            fetchData('settings');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleUpdateRole = async (roleId: string, updatedData: Partial<AdminRole>) => {
        if (!adminUser) return;

        if (isFullAdmin(editingRole) || isFullAdmin(updatedData)) {
            setError('Full Admin role is protected and cannot be edited.');
            return;
        }

        setError(null);
        try {
            const response = await fetch(`/api/admin/roles/${roleId}/update?userId=${adminUser.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to update role');
            }
            await fetchData('settings');
            setEditingRole(null);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            throw err;
        }
    };

    const handleToggleRoleStatus = async (role: AdminRole) => {
        if (isFullAdmin(role)) {
            setError('Full Admin role is protected and cannot be suspended or blocked.');
            return;
        }

        const newStatus = role.status === 'active' ? 'suspended' : 'active';
        if (!window.confirm(`Are you sure you want to ${newStatus === 'active' ? 'activate' : 'suspend'} the role "${role.name}"?`)) return;
        await handleUpdateRole(role.id, { status: newStatus });
    };

    const handleSavePaymentSettings = async (settings: { providers: any, instructions: string }) => {
        if(!adminId) return;
        try {
            const response = await fetch(`/api/admin/payment-settings?userId=${adminId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    paymentProviders: settings.providers,
                    agentFloatInstructions: settings.instructions
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save payment settings');
            setPaymentSettings(data.paymentSettings);
            alert('Payment settings saved.');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleApproveTransaction = async (transactionId: string) => {
        if (!adminUser || !window.confirm('Are you sure you want to approve this transaction?')) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/manual-transactions/${transactionId}/approve?userId=${adminUser.id}`, {
                method: 'POST',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to approve transaction');
            }
            fetchData('manual-transactions'); // Refresh the list
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleRejectTransaction = async (transactionId: string) => {
        if (!adminUser || !window.confirm('Are you sure you want to reject this transaction?')) return;
        setError(null);
        try {
            const response = await fetch(`/api/admin/manual-transactions/${transactionId}/reject?userId=${adminUser.id}`, {
                method: 'POST',
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to reject transaction');
            }
            fetchData('manual-transactions'); // Refresh the list
        } catch (err: any) {
            setError(err.message);
        }
    };

    if (!adminUser) {
        return (
            <div className="bg-gray-900 text-white min-h-screen flex items-center justify-center">
                <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center w-full max-w-sm">
                    <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
                    <p className="text-gray-400 mb-6">Restricted Access</p>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Username"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded mb-4"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="bg-gray-700 text-white w-full px-4 py-2 rounded mb-4"
                    />
                    <button onClick={handleAuth} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded w-full">
                        Login
                    </button>
                    {error && <p className="text-red-500 mt-4">{error}</p>}
                </div>
            </div>
        );
    }
    
    const hasPermission = (permission: string) => {
        if (permission === 'self') return true;
        if (!adminUser) return false;
        // Super admin has all permissions
        if (adminUser.username === 'admin' || adminUser.role === 'Super Admin') return true;
        return adminUser.permissions?.includes(permission);
    };

    const renderView = () => {
        // Find user by role
        const usersByRole = (adminSettings?.roles || []).reduce((groups: Record<string, any[]>, admin: any) => {
            const roleName = admin.name || 'Custom Admin';
            if (!groups[roleName]) groups[roleName] = [];
            groups[roleName].push(admin);
            return groups;
        }, {});

        switch (view) {
            case 'stats': return <StatsGrid stats={stats} rooms={rooms} manualTransactions={manualTransactions} setView={setView} />;
            case 'users': return <UsersTable users={users} onEdit={setEditingUser} onDelete={handleDeleteUser} onImpersonate={handleImpersonate} />;
            case 'rooms': return <RoomsTable rooms={rooms} onCancel={handleCancelGame} onSpectate={handleSpectate} />;
            case 'transactions': return <TransactionsTable transactions={transactions} />;
            case 'manual-transactions': return <ManualTransactionsTable transactions={manualTransactions} onApprove={handleApproveTransaction} onReject={handleRejectTransaction} />;
            case 'agents': return <AgentsTable agents={agents} onEdit={setEditingAgent} onCredit={setCreditingAgent} onDelete={handleDeleteAgent} onToggleStatus={handleToggleAgentStatus} onCreate={() => setCreateAgentModalOpen(true)} />;
            case 'agent-requests': return <AgentRequestsTable requests={agentRequests} onApprove={handleApproveAgentRequest} onReject={handleRejectAgentRequest} isProcessing={(id) => processingRequestId === id} />;
            case 'tournaments': return <TournamentsTable
                tournaments={tournamentsList}
                onCreate={async (data) => {
                  const response = await fetch(`/api/admin/tournaments/create?userId=${adminUser.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to create tournament');
                  }
                  await fetchData('tournaments');
                }}
                onCancel={async (id) => {
                  const response = await fetch(`/api/admin/tournaments/${id}/cancel?userId=${adminUser.id}`, {
                    method: 'POST',
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to cancel tournament');
                  }
                  await fetchData('tournaments');
                }}
                onDelete={async (id) => {
                  const response = await fetch(`/api/admin/tournaments/${id}?userId=${adminUser.id}`, {
                    method: 'DELETE',
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to delete tournament');
                  }
                  await fetchData('tournaments');
                }}
                onStart={async (id) => {
                  const response = await fetch(`/api/admin/tournaments/${id}/start?userId=${adminUser.id}`, {
                    method: 'POST',
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to start tournament');
                  }
                  await fetchData('tournaments');
                }}
                onEdit={async (id, data) => {
                  const response = await fetch(`/api/admin/tournaments/${id}/edit?userId=${adminUser.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data),
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to edit tournament');
                  }
                  await fetchData('tournaments');
                }}
                onRemovePlayer={async (id, targetUserId) => {
                  const response = await fetch(`/api/admin/tournaments/${id}/remove-player?userId=${adminUser.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUserId }),
                  });
                  if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to remove player');
                  }
                  await fetchData('tournaments');
                }}
            />;
            case 'settings': return <Settings 
                adminSettings={{...adminSettings, usersByRole}}
                paymentSettings={paymentSettings} 
                onSavePaymentSettings={handleSavePaymentSettings}
                onCreateRole={() => setCreateRoleModalOpen(true)}
                onDeleteRole={handleDeleteRole}
                onUpdateRole={handleUpdateRole}
                onToggleRoleStatus={handleToggleRoleStatus}
                onEditRole={setEditingRole}
                permissionsList={permissionsList}
                adminUser={adminUser}
            />;
            case 'my-settings': return (
                <div className="mx-auto w-full max-w-2xl rounded-xl bg-white p-4 shadow-md sm:p-6">
                    <h2 className="text-xl font-bold text-gray-900">My Settings</h2>
                    <p className="mt-1 text-sm text-gray-500">Manage your own admin account securely.</p>
                    <div className="mt-6 rounded-lg bg-gray-50 p-4">
                        <div className="mb-4 border-b border-gray-200 pb-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signed in as</p>
                            <p className="mt-1 font-semibold text-gray-900">{adminUser.username}</p>
                            <p className="text-sm text-gray-500">{adminUser.role || 'Admin role'}</p>
                        </div>
                        <h3 className="mb-3 text-lg font-bold text-gray-900">Change Password</h3>
                        <ChangePasswordForm
                            adminId={adminUser.id}
                            onSuccess={(message) => toast.success(message)}
                            onError={(message) => toast.error(message)}
                        />
                    </div>
                </div>
            );
            default: return null;
        }
    };

    return (
        <AdminLayout 
            user={adminUser} 
            onLogout={handleLogout} 
            view={view} 
            setView={setView}
            hasPermission={hasPermission}
        >
            <Toaster />
            <div className="w-full min-w-0 p-3 sm:p-4 lg:p-6">
                {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
                {renderView()}
            </div>
            {editingUser && (
                <UserEditModal 
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={handleSaveUser}
                    isAdmin={true}
                />
            )}
            <CreateAgentModal
                isOpen={isCreateAgentModalOpen}
                onClose={() => setCreateAgentModalOpen(false)}
                onCreateAgent={handleCreateAgent}
            />
            {editingAgent && (
                <EditAgentModal
                    agent={editingAgent}
                    onClose={() => setEditingAgent(null)}
                    onSave={handleUpdateAgent}
                />
            )}
            {creditingAgent && (
                <CreditAgentModal
                    agent={creditingAgent}
                    onClose={() => setCreditingAgent(null)}
                    onSave={handleCreditAgent}
                />
            )}
            {(isCreateRoleModalOpen || editingRole) && (
                <EditRoleModal
                    isOpen={isCreateRoleModalOpen || !!editingRole}
                    onClose={() => { setCreateRoleModalOpen(false); setEditingRole(null); }}
                    onCreateRole={handleCreateRole}
                    onUpdateRole={handleUpdateRole}
                    role={editingRole}
                    permissionsList={permissionsList}
                />
            )}
            {spectatingRoomId && (() => {
                const spectatingRoom = rooms.find(r => r.id === spectatingRoomId);
                if (!spectatingRoom) return null;
                return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[90vh] sm:h-3/4 overflow-auto relative">
                        <button 
                            onClick={() => setSpectatingRoomId(null)} 
                            className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 z-10"
                        >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <GameRoomComponent 
                            room={spectatingRoom} 
                            user={{
                                id: adminUser.id,
                                username: adminUser.username,
                                avatar: '👑',
                                balance: 0,
                                winCount: 0,
                                lossCount: 0
                            }}
                            userId={adminUser.id}
                            onLeave={() => setSpectatingRoomId(null)}
                            onLogout={handleLogout}
                            onToggleReady={() => {}}
                            onAddBot={() => {}}
                            onStartMatch={() => {}}
                            onRollDice={() => {}}
                            onMoveToken={() => {}}
                            onSendChat={() => {}}
                            onProfileUpdate={async () => {}}
                            onRetryJoin={() => {}}
                        />
                    </div>
                </div>
                );
            })()}
        </AdminLayout>
    );
};

export default AdminDashboard;
