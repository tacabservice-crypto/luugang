
import React from 'react';
import { formatCurrency } from '../../utils/number';

const TransactionsTable = ({ transactions }) => {
  return (
    <div className="w-full min-w-0 bg-white p-3 sm:p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Transactions</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[820px] w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map(tx => (
              <tr key={tx.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(tx.timestamp).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{tx.userId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">{tx.type}</td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                  tx.type.includes('payout') || tx.type.includes('deposit') ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(tx.amount)}
                </td>
                <td className="px-6 py-4 min-w-64 text-sm text-gray-500">{tx.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionsTable;
