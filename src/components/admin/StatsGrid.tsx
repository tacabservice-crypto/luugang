import React from 'react';
import { Users, Home, Activity, DollarSign, Wifi, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../../utils/number';
import MonthlyStatsChart from './MonthlyStatsChart';

const StatCard = ({ title, value, icon: Icon, color, percentage }) => (
  <div className={`p-5 rounded-xl text-white shadow-lg`} style={{ background: `linear-gradient(135deg, ${color[0]} 0%, ${color[1]} 100%)` }}>
    <div className="flex justify-between items-start">
        <div className="flex flex-col">
            <p className="text-sm font-medium opacity-80">{title}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
        </div>
        <div className="p-3 bg-white/20 rounded-lg">
            <Icon size={24} />
        </div>
    </div>
    <div className="flex items-center text-xs mt-3 opacity-90">
        {percentage >= 0 ? <TrendingUp size={16} className="mr-1" /> : <TrendingDown size={16} className="mr-1" />}
        <span>{percentage}% vs last week</span>
    </div>
  </div>
);

const RoomCard = ({ room }) => {
    const handleSpectate = () => {
        window.open(`/${room.id}?spectate=true`, '_blank');
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-lg flex flex-col justify-between hover:shadow-xl transition-shadow">
            <div>
                <div className="flex justify-between items-center mb-3">
                    <p className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">#{room.id}</p>
                    <span className="text-sm font-bold text-green-600">{formatCurrency(room.betAmount)}</span>
                </div>
                <div className="flex items-center -space-x-2">
                    {room.players.map(p => (
                        <div key={p.userId} className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-200 border-2 border-white" title={p.username}>
                            <span className="text-xl">{p.avatar}</span>
                        </div>
                    ))}
                </div>
            </div>
            <button 
                onClick={handleSpectate}
                className="mt-4 w-full flex items-center justify-center text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded-lg transition-colors"
            >
                <Eye size={16} className="mr-2"/>
                Spectate
            </button>
        </div>
    );
};


const StatsGrid = ({ stats, rooms = [], manualTransactions = [], setView }) => {
  if (!stats) return <p className="text-center text-gray-500">Loading stats...</p>;

  const pendingDeposits = manualTransactions.filter(tx => tx.transactionType === 'deposit' && tx.status === 'pending');
  const pendingWithdrawals = manualTransactions.filter(tx => tx.transactionType === 'withdraw' && tx.status === 'pending');
  const activeRooms = rooms.filter(r => r.status === 'playing');

  const mainStats = [
    { title: 'Total Users', value: stats.totalUsers, icon: Users, color: ['#2563eb', '#1d4ed8'], percentage: 5 },
    { title: 'House Revenue', value: formatCurrency(stats.houseRevenue), icon: DollarSign, color: ['#10b981', '#059669'], percentage: 12 },
    { title: 'Active Games', value: stats.activeRooms, icon: Activity, color: ['#ef4444', '#dc2626'], percentage: -3 },
  ];

  const monthlyData = [
    { month: 'Jan', sales: 4000, views: 2400 },
    { month: 'Feb', sales: 3000, views: 1398 },
    { month: 'Mar', sales: 2000, views: 9800 },
    { month: 'Apr', sales: 2780, views: 3908 },
    { month: 'May', sales: 1890, views: 4800 },
    { month: 'Jun', sales: 2390, views: 3800 },
  ];

  return (
    <div className="space-y-8">
        {/* Main Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {mainStats.map(item => (
                <StatCard key={item.title} {...item} />
            ))}
        </div>

        {/* Pending Actions Card */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <AlertTriangle size={22} className="mr-3 text-amber-500" />
                Pending Actions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div 
                    className="bg-gray-50 p-4 rounded-lg flex items-center cursor-pointer hover:bg-gray-100"
                    onClick={() => setView('manual-transactions')}
                >
                    <div className="p-3 rounded-lg bg-green-100 text-green-600"><ArrowUpCircle size={24} /></div>
                    <div className="ml-4">
                        <p className="text-sm text-gray-500 font-medium">Pending Deposits</p>
                        <p className="text-2xl font-bold text-gray-900">{pendingDeposits.length}</p>
                    </div>
                </div>
                <div 
                    className="bg-gray-50 p-4 rounded-lg flex items-center cursor-pointer hover:bg-gray-100"
                    onClick={() => setView('manual-transactions')}
                >
                    <div className="p-3 rounded-lg bg-red-100 text-red-600"><ArrowDownCircle size={24} /></div>
                    <div className="ml-4">
                        <p className="text-sm text-gray-500 font-medium">Pending Withdrawals</p>
                        <p className="text-2xl font-bold text-gray-900">{pendingWithdrawals.length}</p>
                    </div>
                </div>
                <div
                    className="bg-gray-50 p-4 rounded-lg flex items-center cursor-pointer hover:bg-gray-100"
                    onClick={() => setView('agent-requests')}
                >
                    <div className="p-3 rounded-lg bg-purple-100 text-purple-600"><DollarSign size={24} /></div>
                    <div className="ml-4">
                        <p className="text-sm text-gray-500 font-medium">Agent Requests</p>
                        <p className="text-2xl font-bold text-gray-900">{0}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Monthly Stats Chart */}
        <MonthlyStatsChart data={monthlyData} />

        {/* Active Games */}
        <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
                <Home size={22} className="mr-3 text-indigo-500" />
                Active Games ({activeRooms.length})
            </h3>
            {activeRooms.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {activeRooms.map(room => (
                        <RoomCard key={room.id} room={room} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 bg-white rounded-xl shadow-lg">
                    <p className="text-gray-500">No active games at the moment.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default StatsGrid;
