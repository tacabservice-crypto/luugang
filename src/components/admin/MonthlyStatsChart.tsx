import React from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MonthlyStatsChart = ({ data }) => {
  // Default data if none is provided to avoid crashing the component
  const defaultData = [
    { month: 'Jan', deposits: 0, withdrawals: 0, revenue: 0 },
  ];

  const chartData = data && data.length > 0 ? data : defaultData;

  return (
    <div className="min-w-0 bg-white p-4 sm:p-5 rounded-2xl">
      <p className="text-[10px] font-black uppercase tracking-[.18em] text-indigo-600">Six-month trend</p>
      <h3 className="mt-1 text-xl font-black text-slate-900">Money flow & platform revenue</h3>
      <p className="mb-4 text-xs text-slate-500">Deposits and withdrawals are cash flow; revenue is earned platform income.</p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={chartData}
          margin={{
            top: 5,
            right: 8,
            left: 0,
            bottom: 5,
          }}
        >
          <defs><linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.35}/><stop offset="95%" stopColor="#10b981" stopOpacity={0.02}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:'#64748b',fontSize:11}} />
          <YAxis axisLine={false} tickLine={false} tick={{fill:'#94a3b8',fontSize:10}} />
          <Tooltip 
            contentStyle={{ 
                backgroundColor: 'rgba(15, 23, 42, 0.96)',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem'
            }}
            labelStyle={{ color: '#f3f4f6' }}
            itemStyle={{ fontWeight: 'bold' }}
          />
          <Legend />
          <Area type="monotone" dataKey="revenue" name="Platform revenue" stroke="#10b981" strokeWidth={3} fill="url(#revenueGradient)" />
          <Bar dataKey="deposits" name="Deposits" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={24}/>
          <Bar dataKey="withdrawals" name="Withdrawals" fill="#8b5cf6" radius={[5, 5, 0, 0]} maxBarSize={24}/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MonthlyStatsChart;
