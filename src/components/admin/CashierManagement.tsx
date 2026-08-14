import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, DollarSign, MapPin, RefreshCw, TimerOff, Users } from 'lucide-react';
import { userErrorMessage } from '../../utils/userError';

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;
const duration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

const CashierManagement = ({ adminId }: { adminId: string }) => {
  const [data, setData] = useState<any>({ period: '', cashiers: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(`/api/admin/cashiers?userId=${adminId}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Cashier accounts could not be loaded.');
      setData(body);
    } catch (err) {
      setError(userErrorMessage(err, 'Cashier accounts could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => { void load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, [load]);

  const markPaid = async (cashier: any) => {
    if (!window.confirm(`Record ${money(cashier.payableAmount)} payroll for ${cashier.name || cashier.username}?`)) return;
    setPaying(cashier.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/cashiers/${cashier.id}/pay?userId=${adminId}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Payroll could not be recorded.');
      await load();
    } catch (err) {
      setError(userErrorMessage(err, 'Payroll could not be recorded.'));
    } finally {
      setPaying(null);
    }
  };

  const cashiers = data.cashiers || [];
  const totals = cashiers.reduce((sum: any, cashier: any) => ({ approved: sum.approved + cashier.approved, amount: sum.amount + cashier.handledAmount, payroll: sum.payroll + (cashier.salaryStatus === 'paid' ? 0 : cashier.payableAmount), online: sum.online + Number(cashier.online) }), { approved: 0, amount: 0, payroll: 0, online: 0 });

  if (loading) return <div className="p-8 text-center text-gray-500">Loading cashier management...</div>;
  return <div className="space-y-6 p-3 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-black text-gray-900">Cashier Management</h2><p className="text-sm text-gray-500">Payroll and performance for {data.period}. Bonus is earned only after the approved target is reached.</p></div><button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"><RefreshCw size={16}/> Refresh</button></div>
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Online Cashiers', `${totals.online}/${cashiers.length}`, Users], ['Approved', totals.approved, CheckCircle2], ['Handled Value', money(totals.amount), DollarSign], ['Pending Payroll', money(totals.payroll), Clock3]].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl bg-white p-4 shadow"><Icon className="mb-2 text-purple-600" size={20}/><p className="text-xs font-bold uppercase text-gray-500">{label}</p><p className="mt-1 text-xl font-black text-gray-900">{value}</p></div>)}
    </div>
    <div className="overflow-x-auto rounded-xl bg-white shadow"><table className="min-w-[1250px] w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="p-4">Cashier</th><th className="p-4">Performance</th><th className="p-4">Requests</th><th className="p-4">Response</th><th className="p-4">Handled</th><th className="p-4">Salary</th><th className="p-4">Bonus</th><th className="p-4">Payroll</th><th className="p-4">Action</th></tr></thead><tbody className="divide-y">
      {cashiers.map((cashier: any) => <tr key={cashier.id} className="align-top"><td className="p-4"><div className="font-bold text-gray-900">{cashier.name || cashier.username}</div><div className="text-xs text-gray-500">@{cashier.username}</div><div className="mt-2 flex items-center gap-1 text-xs text-gray-500"><MapPin size={13}/>{cashier.location}</div><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-bold ${cashier.online ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{cashier.online ? 'Online' : 'Offline'}</span></td>
        <td className="p-4"><div className="font-bold">{cashier.approved}/{cashier.monthlyTarget || 0}</div><div className="mt-1 h-2 w-28 overflow-hidden rounded bg-gray-200"><div className="h-full bg-purple-600" style={{width: `${Math.min(100, cashier.monthlyTarget ? cashier.approved / cashier.monthlyTarget * 100 : 0)}%`}}/></div><span className={`mt-2 inline-block text-xs font-bold ${cashier.targetReached ? 'text-green-600' : 'text-amber-600'}`}>{cashier.targetReached ? 'Target reached' : 'In progress'}</span></td>
        <td className="p-4"><div>Approved: <b>{cashier.approved}</b></div><div>Rejected: <b>{cashier.rejected}</b></div><div>Deposits: {cashier.deposits}</div><div>Withdrawals: {cashier.withdrawals}</div></td>
        <td className="p-4"><div>{duration(cashier.averageResponseSeconds)}</div><div className="mt-2 flex items-center gap-1 text-red-600"><TimerOff size={14}/> {cashier.timedOut} timeouts</div></td><td className="p-4 font-mono font-bold">{money(cashier.handledAmount)}</td><td className="p-4 font-mono">{money(cashier.monthlySalary)}</td><td className="p-4 font-mono"><span className={cashier.targetReached ? 'text-green-600 font-bold' : 'text-gray-400'}>{money(cashier.targetReached ? cashier.targetBonus : 0)}</span></td><td className="p-4"><div className="font-mono font-black">{money(cashier.payableAmount)}</div><span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-bold ${cashier.salaryStatus === 'paid' ? 'bg-green-100 text-green-700' : cashier.salaryStatus === 'due' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{cashier.salaryStatus}</span></td><td className="p-4"><button disabled={cashier.salaryStatus === 'paid' || paying === cashier.id} onClick={() => void markPaid(cashier)} className="rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white disabled:bg-gray-300">{paying === cashier.id ? 'Saving...' : cashier.salaryStatus === 'paid' ? 'Paid' : 'Mark Paid'}</button></td></tr>)}
      {cashiers.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-gray-500">No cashier roles have been created.</td></tr>}
    </tbody></table></div>
    <div className="rounded-xl bg-white p-4 shadow"><h3 className="mb-3 text-lg font-black">Payroll History</h3><div className="overflow-x-auto"><table className="min-w-[700px] w-full text-sm"><thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-2">Cashier</th><th>Period</th><th>Salary</th><th>Bonus</th><th>Total</th><th>Paid</th></tr></thead><tbody className="divide-y">{(data.history || []).map((payment: any) => <tr key={payment.id}><td className="py-3 font-bold">{payment.cashierName}</td><td>{payment.period}</td><td>{money(payment.salary)}</td><td>{money(payment.bonus)}</td><td className="font-bold">{money(payment.total)}</td><td>{new Date(payment.paidAt).toLocaleString()}</td></tr>)}</tbody></table></div></div>
  </div>;
};

export default CashierManagement;
