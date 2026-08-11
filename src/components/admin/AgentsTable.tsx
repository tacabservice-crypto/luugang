
import React from 'react';
import { Edit, ShieldCheck, DollarSign, Power, PowerOff, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils/number';
import { isFullAdmin } from '../../utils/admin';

const AgentsTable = ({ agents, onCredit, onEdit, onToggleStatus, onDelete, onCreate }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-800">Agents</h3>
        <button 
            onClick={onCreate} 
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Create Agent
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Float Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agents.map(agent => {
              const protectedAgent = isFullAdmin(agent);
              return (
              <tr key={agent.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{agent.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    <span>{agent.username}</span>
                    {protectedAgent && (
                      <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1">
                        <ShieldCheck size={12} /> Full Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">{(agent.commissionRate * 100).toFixed(2)}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{formatCurrency(agent.floatBalance)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    agent.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {agent.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  {protectedAgent ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-bold cursor-not-allowed" title="Full Admin agent is protected and cannot be edited, suspended, or deleted">
                      🔒 Protected
                    </span>
                  ) : (
                    <>
                      <button onClick={() => onCredit(agent)} className="text-green-500 hover:text-green-700" title="Credit Agent"><DollarSign size={18} /></button>
                      <button onClick={() => onEdit(agent)} className="text-indigo-500 hover:text-indigo-700" title="Edit Agent"><Edit size={18} /></button>
                      <button onClick={() => onToggleStatus(agent)} className={agent.status === 'Active' ? 'text-yellow-500 hover:text-yellow-700' : 'text-green-500 hover:text-green-700'} title="Toggle Status">
                        {agent.status === 'Active' ? <PowerOff size={18} /> : <Power size={18} />}
                      </button>
                      <button onClick={() => onDelete(agent.id)} className="text-red-500 hover:text-red-700" title="Delete Agent"><Trash2 size={18} /></button>
                    </>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgentsTable;
