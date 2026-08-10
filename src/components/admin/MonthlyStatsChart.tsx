import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MonthlyStatsChart = ({ data }) => {
  // Default data if none is provided to avoid crashing the component
  const defaultData = [
    { month: 'Jan', sales: 0, views: 0 },
    { month: 'Feb', sales: 0, views: 0 },
    { month: 'Mar', sales: 0, views: 0 },
    { month: 'Apr', sales: 0, views: 0 },
    { month: 'May', sales: 0, views: 0 },
    { month: 'Jun', sales: 0, views: 0 },
  ];

  const chartData = data && data.length > 0 ? data : defaultData;

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg">
      <h3 className="text-xl font-bold text-gray-800 mb-4">Monthly Overview</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
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
          <Bar dataKey="sales" name="Sales" fill="#2563eb" />
          <Bar dataKey="views" name="Views" fill="#8b5cf6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MonthlyStatsChart;
