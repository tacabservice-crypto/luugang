import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Banknote, CheckCircle2, Clock3, MapPin, RefreshCw, Target, Users, WalletCards, XCircle } from 'lucide-react';
import { userErrorMessage } from '../../utils/userError';

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;

export default function CashierOverview({ adminId, openQueue }: { adminId: string; openQueue: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setError('');
      const response = await fetch(`/api/admin/cashier-overview?userId=${encodeURIComponent(adminId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Cashier dashboard could not be loaded.');
      setData(body);
    } catch (err) { setError(userErrorMessage(err)); }
    finally { setLoading(false); }
  }, [adminId]);
  useEffect(() => { void load(); const timer = window.setInterval(load, 15_000); return () => window.clearInterval(timer); }, [load]);

  if (loading) return <div className="p-10 text-center font-semibold text-slate-500">Loading your cashier dashboard...</div>;
  if (!data) return <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error || 'Dashboard unavailable.'}</div>;
  const progress = Math.min(100, Number(data.targetProgress || 0));
  const cards = [
    ['Money handled', money(data.handledAmount), Banknote, 'from approved requests', 'from-emerald-500 to-teal-600'],
    ['Current earnings', money(data.currentEarnings), WalletCards, data.salaryStatus, 'from-violet-500 to-purple-700'],
    ['People served', data.peopleServed, Users, `${data.completed} completed requests`, 'from-blue-500 to-cyan-600'],
    ['Pending now', data.pending, Clock3, 'requests waiting for you', 'from-amber-500 to-orange-600'],
  ];
  return <div className="min-h-full bg-gradient-to-br from-slate-100 via-purple-50 to-blue-50 p-3 sm:p-6">
    <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-purple-950 to-indigo-950 p-5 text-white shadow-2xl sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-bold text-purple-200"><MapPin size={16}/>{(data.locations || []).join(' / ')}</div><h2 className="text-2xl font-black sm:text-3xl">Welcome, {data.name}</h2><p className="mt-2 text-sm text-slate-300">Your live performance, target and payroll summary for {data.period}.</p></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-xl border border-white/20 bg-white/10 p-3 hover:bg-white/20" aria-label="Refresh"><RefreshCw size={19}/></button><button onClick={openQueue} className="rounded-xl bg-white px-5 py-3 text-sm font-black text-purple-900 shadow-lg">Open requests ({data.pending})</button></div></div>
    </div>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(([label, value, Icon, note, color]: any) => <div key={label} className="overflow-hidden rounded-2xl bg-white shadow-lg"><div className={`h-1.5 bg-gradient-to-r ${color}`}/><div className="p-4"><Icon className="mb-3 text-purple-700" size={22}/><p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-900 sm:text-2xl">{value}</p><p className="mt-1 text-xs capitalize text-slate-400">{note}</p></div></div>)}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-2xl bg-white p-5 shadow-lg"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-purple-600">Monthly target</p><h3 className="mt-1 text-2xl font-black text-slate-900">{data.approved} / {data.monthlyTarget || 0} approvals</h3></div>{data.targetReached ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700"><BadgeCheck size={16}/> Server verified</span> : <Target className="text-purple-600" size={30}/>}</div><div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${data.targetReached ? 'bg-emerald-500' : 'bg-gradient-to-r from-purple-600 to-blue-500'}`} style={{width: `${progress}%`}}/></div><div className="mt-3 flex justify-between text-sm"><span className="font-bold text-slate-600">{progress.toFixed(0)}% completed</span><span className="font-black text-purple-700">{data.remainingTarget} remaining</span></div><div className={`mt-5 rounded-xl border p-4 ${data.targetReached ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-purple-100 bg-purple-50 text-purple-800'}`}><p className="font-black">{data.targetReached ? `Target complete — bonus ${money(data.earnedBonus)} earned` : `Complete ${data.remainingTarget} more approved requests to unlock ${money(data.targetBonus)} bonus.`}</p><p className="mt-1 text-xs">Target completion is verified automatically from server records.</p></div></div>
      <div className="rounded-2xl bg-white p-5 shadow-lg"><h3 className="font-black text-slate-900">Request performance</h3><div className="mt-4 space-y-3">{[[CheckCircle2,'Approved',data.approved,'text-emerald-600'],[XCircle,'Rejected',data.rejected,'text-red-500'],[Clock3,'Pending',data.pending,'text-amber-500']].map(([Icon,label,value,color]:any)=><div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-2 text-sm font-bold text-slate-600"><Icon size={18} className={color}/>{label}</span><strong className="text-lg text-slate-900">{value}</strong></div>)}</div><div className="mt-4 border-t pt-4 text-sm text-slate-500"><div className="flex justify-between"><span>Monthly salary</span><strong>{money(data.monthlySalary)}</strong></div><div className="mt-2 flex justify-between"><span>Earned bonus</span><strong className="text-emerald-600">{money(data.earnedBonus)}</strong></div></div></div>
    </div>
  </div>;
}
