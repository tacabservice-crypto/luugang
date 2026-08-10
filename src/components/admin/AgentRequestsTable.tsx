import React from 'react';
import { AgentRequest } from '../../types/game';
import { CheckCircle, XCircle } from 'lucide-react';

interface AgentRequestsTableProps {
  requests: AgentRequest[];
  onApprove: (requestId: string) => Promise<void>;
  onReject: (requestId: string) => Promise<void>;
  isProcessing: (requestId: string) => boolean;
}

const AgentRequestsTable: React.FC<AgentRequestsTableProps> = ({ requests, onApprove, onReject, isProcessing }) => {
  if (!requests.length) {
    return <p className="text-center text-gray-500 mt-4">No pending agent requests.</p>;
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resolved By</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {requests.map((req) => (
            <tr key={req.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(req.createdAt).toLocaleString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{req.agentUsername}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-mono">${req.amount.toFixed(2)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-center">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    req.status === 'approved' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                }`}>
                  {req.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {req.resolverUsername && (
                  <div>
                    {req.resolverUsername}
                    <div className="text-xs text-gray-400">{new Date(req.resolvedAt!).toLocaleString()}</div>
                  </div>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                {req.status === 'pending' && (
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => onApprove(req.id)}
                      disabled={isProcessing(req.id)}
                      className="text-green-600 hover:text-green-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                      title="Approve"
                    >
                      <CheckCircle size={20} />
                    </button>
                    <button
                      onClick={() => onReject(req.id)}
                      disabled={isProcessing(req.id)}
                      className="text-red-600 hover:text-red-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                      title="Reject"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AgentRequestsTable;
