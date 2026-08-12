import React from 'react';
import { Users, Home, Activity, DollarSign, Wifi, AlertTriangle, ArrowUpCircle, ArrowDownCircle, Eye, TrendingUp, ShieldCheck, Trophy, ReceiptText, Clock3, ChevronRight, CircleDollarSign } from 'lucide-react';
import { formatCurrency } from '../../utils/number';
import MonthlyStatsChart from './MonthlyStatsChart';

const StatCard = ({ title, value, icon: Icon, color, detail }) => (
  <div className="rounded-xl p-4 text-white shadow-lg sm:p-5" style={{ background: `linear-gradient(135deg, ${color[0]} 0%, ${color[1]} 100%)` }}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-medium opacity-80">{title}</p><p className="mt-1 truncate text-2xl font-bold sm:text-3xl">{value}</p></div>
      <div className="shrink-0 rounded-lg bg-white/20 p-3"><Icon size={24} /></div>
    </div>
    <div className="mt-3 flex items-center text-xs opacity-90"><TrendingUp size={15} className="mr-1" /><span>{detail}</span></div>
  </div>
);

const SummaryItem = ({ icon: Icon, label, value, note, color = 'text-blue-600', onClick }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-left transition hover:border-purple-200 hover:bg-purple-50/50">
    <span className={`rounded-lg bg-white p-2.5 shadow-sm ${color}`}><Icon size={19}/></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-gray-500">{label}</span><span className="block text-lg font-bold text-gray-900">{value}</span>{note && <span className="block truncate text-[11px] text-gray-400">{note}</span>}</span>
    {onClick && <ChevronRight size={17} className="text-gray-300"/>}
  </button>
);

const RoomCard = ({ room }) => (
  <div className="flex flex-col justify-between rounded-xl bg-white p-4 shadow-lg transition-shadow hover:shadow-xl">
    <div><div className="mb-3 flex items-center justify-between"><p className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-500">#{room.id}</p><span className="text-sm font-bold text-green-600">{formatCurrency(room.betAmount)}</span></div><div className="flex items-center -space-x-2">{room.players.map(p => <div key={p.userId} className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-gray-200" title={p.username}><span className="text-xl">{p.avatar}</span></div>)}</div></div>
    <button onClick={() => window.open(`/${room.id}?spectate=true`, '_blank')} className="mt-4 flex w-full items-center justify-center rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600"><Eye size={16} className="mr-2"/>Spectate</button>
  </div>
);

const StatsGrid = ({ stats, rooms = [], manualTransactions = [], setView }) => {
  if (!stats) return <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow">Loading platform overview...</div>;

  const pendingDeposits = manualTransactions.filter(tx => tx.managedBy !== 'agent' && tx.transactionType === 'deposit' && tx.status === 'pending');
  const pendingWithdrawals = manualTransactions.filter(tx => tx.managedBy !== 'agent' && tx.transactionType === 'withdraw' && tx.status === 'pending');
  const activeRooms = rooms.filter(room => room.status === 'playing');
  const mainStats = [
    { title: 'Total Users', value: stats.totalUsers, icon: Users, color: ['#2563eb', '#1d4ed8'], detail: `${stats.onlineClients || 0} live connections` },
    { title: 'House Revenue', value: formatCurrency(stats.houseRevenue), icon: DollarSign, color: ['#10b981', '#059669'], detail: 'Recorded platform earnings' },
    { title: 'Active Games', value: stats.activeRooms, icon: Activity, color: ['#ef4444', '#dc2626'], detail: `${stats.waitingRooms || 0} waiting rooms` },
    { title: 'Transactions', value: stats.totalTransactions || 0, icon: ReceiptText, color: ['#8b5cf6', '#6d28d9'], detail: `${stats.pendingAdminTransactions || 0} need admin review` },
  ];

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 p-5 text-white shadow-xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-300">Platform overview</p><h2 className="mt-1 text-2xl font-black sm:text-3xl">Operations at a glance</h2><p className="mt-1 max-w-2xl text-sm text-slate-300">A live summary of players, games, money movement, agents, tournaments and items requiring attention.</p></div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3"><Wifi size={19} className="text-emerald-400"/><div><span className="block text-xs text-slate-400">Live connections</span><strong className="text-xl">{stats.onlineClients || 0}</strong></div></div></div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{mainStats.map(item => <StatCard key={item.title} {...item}/>)}</div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="rounded-xl bg-white p-4 shadow-lg sm:p-6 xl:col-span-2">
          <h3 className="mb-4 flex items-center text-xl font-bold text-gray-800"><AlertTriangle size={22} className="mr-3 text-amber-500"/>Pending Actions</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryItem icon={ArrowUpCircle} label="Pending Deposits" value={pendingDeposits.length} note="Admin-managed requests" color="text-green-600" onClick={() => setView('manual-transactions')}/>
            <SummaryItem icon={ArrowDownCircle} label="Pending Withdrawals" value={pendingWithdrawals.length} note="Admin-managed requests" color="text-red-600" onClick={() => setView('manual-transactions')}/>
            <SummaryItem icon={CircleDollarSign} label="Agent Float Requests" value={stats.pendingAgentRequests || 0} note="Awaiting admin decision" color="text-purple-600" onClick={() => setView('agent-requests')}/>
          </div>
        </section>
        <section className="rounded-xl bg-white p-4 shadow-lg sm:p-6"><h3 className="mb-4 text-xl font-bold text-gray-800">System Snapshot</h3><div className="space-y-2"><SummaryItem icon={Home} label="All Rooms" value={stats.totalRooms || 0} note={`${stats.completedRooms || 0} completed`} color="text-indigo-600" onClick={() => setView('rooms')}/><SummaryItem icon={ShieldCheck} label="Active Agents" value={`${stats.activeAgents || 0} / ${stats.totalAgents || 0}`} note="Active / total agents" color="text-purple-600" onClick={() => setView('agents')}/><SummaryItem icon={Trophy} label="Open Tournaments" value={stats.openTournaments || 0} note={`${stats.activeTournaments || 0} currently running`} color="text-amber-600" onClick={() => setView('tournaments')}/></div></section>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3"><div className="min-w-0 xl:col-span-2"><MonthlyStatsChart data={stats.monthlyActivity}/></div><section className="rounded-xl bg-white p-4 shadow-lg sm:p-6"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold text-gray-800">Recent Activity</h3><Clock3 size={20} className="text-gray-400"/></div><div className="space-y-3">{(stats.recentActivity || []).map(activity => <div key={`${activity.kind}-${activity.id}`} className="border-b border-gray-100 pb-3 last:border-0"><div className="flex items-start justify-between gap-3"><p className="line-clamp-2 text-sm font-medium text-gray-700">{activity.title}</p>{activity.amount !== undefined && <span className="whitespace-nowrap text-sm font-bold text-gray-900">{formatCurrency(activity.amount)}</span>}</div><div className="mt-1 flex items-center justify-between text-xs text-gray-400"><span className="capitalize">{activity.status}</span><span>{new Date(activity.timestamp).toLocaleString()}</span></div></div>)}{(!stats.recentActivity || stats.recentActivity.length === 0) && <p className="py-8 text-center text-sm text-gray-400">No recent activity recorded.</p>}</div></section></div>

      <section><div className="mb-4 flex items-center justify-between"><h3 className="flex items-center text-xl font-bold text-gray-800"><Home size={22} className="mr-3 text-indigo-500"/>Active Games ({activeRooms.length})</h3>{stats.waitingRooms > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{stats.waitingRooms} waiting</span>}</div>{activeRooms.length > 0 ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{activeRooms.slice(0, 8).map(room => <RoomCard key={room.id} room={room}/>)}</div> : <div className="rounded-xl bg-white py-10 text-center shadow-lg"><Activity className="mx-auto mb-2 text-gray-300" size={32}/><p className="text-gray-500">No active games at the moment.</p></div>}</section>
    </div>
  );
};

export default StatsGrid;
