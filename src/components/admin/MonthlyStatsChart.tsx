import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MonthlyStatsChart = ({ data }) => {
  // Default data if none is provided to avoid crashing the component
  const defaultData = [
    { month: 'Jan', deposits: 0, withdrawals: 0 },
  ];

  const chartData = data && data.length > 0 ? data : defaultData;

  return (
    <div className="min-w-0 bg-white p-4 sm:p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-bold text-gray-800">Monthly Money Flow</h3>
      <p className="mb-4 text-sm text-gray-500">Deposits and withdrawals recorded during the last six months</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{
            top: 5,
            right: 8,
            left: 0,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip 
            contentStyle={{ 
                backgroundColor: 'rgba(31, 41, 55, 0.9)', 
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '0.5rem'
            }}
            labelStyle={{ color: '#f3f4f6' }}
            itemStyle={{ fontWeight: 'bold' }}
          />
          <Legend />
          <Bar dataKey="deposits" name="Deposits" fill="#2563eb" radius={[4, 4, 0, 0]} />
          <Bar dataKey="withdrawals" name="Withdrawals" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MonthlyStatsChart;
