
import React from 'react';
import { Badge } from 'lucide-react';

const ManualTransactionsTable = ({ transactions, onApprove, onReject }) => {
  if (!transactions || transactions.length === 0) {
    return <p className="text-white">No pending manual transactions.</p>;
  }

  return (
    <div className="bg-gray-800 shadow-lg rounded-lg p-6">
      <h2 className="text-xl font-bold text-white mb-4">Pending Manual Transactions</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left text-gray-300">
          <thead className="bg-gray-700 text-xs text-gray-400 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-6 py-3">User</th>
              <th scope="col" className="px-6 py-3">Type</th>
              <th scope="col" className="px-6 py-3">Provider</th>
              <th scope="col" className="px-6 py-3">Amount</th>
              <th scope="col" className="px-6 py-3">Phone</th>
              <th scope="col" className="px-6 py-3">Sender Phone</th>
              <th scope="col" className="px-6 py-3">Date</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="px-6 py-4">{tx.username} ({tx.userId})</td>
                <td className="px-6 py-4">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    tx.transactionType === 'deposit' ? 'bg-green-800 text-green-100' : 'bg-red-800 text-red-100'
                  }`}>
                    {tx.transactionType}
                  </span>
                </td>
                <td className="px-6 py-4">{tx.provider}</td>
                <td className="px-6 py-4 font-medium">${tx.amount.toFixed(2)}</td>
                <td className="px-6 py-4">{tx.phone || 'N/A'}</td>
                <td className="px-6 py-4">{tx.senderPhone || 'N/A'}</td>
                <td className="px-6 py-4">{new Date(tx.createdAt).toLocaleString()}</td>
                <td className="px-6 py-4">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        tx.status === 'pending' ? 'bg-yellow-800 text-yellow-100' :
                        tx.status === 'approved' ? 'bg-green-800 text-green-100' :
                        'bg-red-800 text-red-100'
                    }`}>
                        {tx.status}
                    </span>
                </td>
                <td className="px-6 py-4">
                  {tx.status === 'pending' && (
                    <div className="flex space-x-2">
                      <button onClick={() => onApprove(tx.id)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded text-xs">
                        Approve
                      </button>
                      <button onClick={() => onReject(tx.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-xs">
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ManualTransactionsTable;
