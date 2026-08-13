import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Eye, Search, ShieldCheck, UserCog, XCircle } from 'lucide-react';
import { ManualTransaction } from '../../types/game';

interface ManualTransactionsTableProps {
  transactions: ManualTransaction[];
  onApprove: (transactionId: string) => void;
  onReject: (transactionId: string) => void;
}

type QueueTab = 'admin' | 'agents';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
};

const ManualTransactionsTable: React.FC<ManualTransactionsTableProps> = ({ transactions = [], onApprove, onReject }) => {
  const [activeTab, setActiveTab] = useState<QueueTab>('admin');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const adminTransactions = useMemo(
    () => transactions.filter(tx => tx.managedBy !== 'agent'),
    [transactions],
  );
  const agentTransactions = useMemo(
    () => transactions.filter(tx => tx.managedBy === 'agent'),
    [transactions],
  );

  const visibleTransactions = useMemo(() => {
    const source = activeTab === 'admin' ? adminTransactions : agentTransactions;
    const term = search.trim().toLowerCase();

    return source.filter(tx => {
      if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
      if (!term) return true;
      return [tx.username, tx.userId, tx.agentUsername, tx.agentId, tx.provider, tx.phone, tx.senderPhone]
        .some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [activeTab, adminTransactions, agentTransactions, search, statusFilter]);

  const pendingAdmin = adminTransactions.filter(tx => tx.status === 'pending').length;
  const pendingAgent = agentTransactions.filter(tx => tx.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Manual Transactions Control</h2>
            <p className="mt-1 text-sm text-slate-400">
              Admin requests are actionable. Agent-managed requests are visible for monitoring only.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3">
              <span className="block text-xs text-blue-300">Admin pending</span>
              <strong className="text-xl text-white">{pendingAdmin}</strong>
            </div>
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 px-4 py-3">
              <span className="block text-xs text-purple-300">Agent pending</span>
              <strong className="text-xl text-white">{pendingAgent}</strong>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 rounded-xl bg-slate-950 p-1.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex items-center justify-between rounded-lg px-4 py-3 text-left transition ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} /> Admin Queue</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{adminTransactions.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center justify-between rounded-lg px-4 py-3 text-left transition ${activeTab === 'agents' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <span className="flex items-center gap-2 font-semibold"><Eye size={18} /> Agent Activity</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{agentTransactions.length}</span>
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${statusFilter === status ? 'bg-slate-200 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search user, agent, phone..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {activeTab === 'agents' && (
          <div className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-purple-500/25 bg-purple-500/10 p-3 text-sm text-purple-200">
            <Eye className="mt-0.5 shrink-0" size={17} />
            <p>Read-only audit view. These requests are controlled by their assigned agents and cannot be approved or rejected by admin.</p>
          </div>
        )}

        <div className="overflow-x-auto p-4">
          <table className="min-w-[980px] w-full text-left text-sm text-slate-300">
            <thead className="text-xs uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3">User</th>
                {activeTab === 'agents' && <th className="px-4 py-3">Assigned agent</th>}
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Resolved by</th>
                <th className="px-4 py-3">{activeTab === 'admin' ? 'Actions' : 'Access'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {visibleTransactions.map(tx => (
                <tr key={tx.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-4">
                    <span className="block font-semibold text-white">{tx.username}</span>
                    <span className="text-xs text-slate-500">{tx.userId}</span>
                  </td>
                  {activeTab === 'agents' && (
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-1.5 font-medium text-purple-300"><UserCog size={15} /> {tx.agentUsername || 'Assigned agent'}</span>
                      <span className="text-xs text-slate-500">{tx.agentId || 'Unknown ID'}</span>
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tx.transactionType === 'deposit' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{tx.transactionType}</span>
                    <span className="ml-2 font-mono font-bold text-white">${Number(tx.amount || 0).toFixed(2)}</span>
                    {tx.transactionType === 'withdraw' && <span className="mt-1 block text-xs text-amber-300">Fee: ${Number(tx.fee || 0).toFixed(2)} · Pay customer: ${Number(tx.netAmount ?? tx.amount).toFixed(2)}</span>}
                    <span className="mt-1 block text-xs uppercase text-slate-500">{tx.provider}</span>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <span className="block">To: {tx.phone || 'N/A'}</span>
                    <span className="block text-slate-500">From: {tx.senderPhone || 'N/A'}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-400">{new Date(tx.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${statusStyles[tx.status] || statusStyles.pending}`}>
                      {tx.status === 'pending' ? <Clock3 size={13} /> : tx.status === 'approved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {tx.resolverUsername || tx.resolvedBy || (tx.status === 'pending' ? 'Awaiting review' : activeTab === 'agents' ? 'Agent' : 'Admin')}
                  </td>
                  <td className="px-4 py-4">
                    {activeTab === 'admin' && tx.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button onClick={() => onApprove(tx.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500">Approve</button>
                        <button onClick={() => onReject(tx.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500">Reject</button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">{activeTab === 'agents' ? 'Read only' : 'Completed'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleTransactions.length === 0 && (
            <div className="py-14 text-center text-slate-500">
              <Clock3 className="mx-auto mb-3 text-slate-700" size={36} />
              <p className="font-medium text-slate-400">No transactions found in this view.</p>
              <p className="mt-1 text-xs">Try another status filter or search term.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManualTransactionsTable;
