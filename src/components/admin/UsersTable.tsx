
import React from 'react';
import { Edit, Trash2, Eye, History } from 'lucide-react';
import { formatCurrency } from '../../utils/number';

const UsersTable = ({ users, onEdit, onDelete, onImpersonate, onViewGames }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Users</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">W/L</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center">
                  <span className="mr-3 text-2xl">{user.avatar}</span>
                  {user.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{formatCurrency(user.balance)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.winCount} / {user.lossCount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-600">{user.role || 'Player'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button onClick={() => onViewGames(user)} className="text-gray-500 hover:text-gray-700"><History size={18} /></button>
                  <button onClick={() => onImpersonate(user)} className="text-blue-500 hover:text-blue-700"><Eye size={18} /></button>
                  <button onClick={() => onEdit(user)} className="text-indigo-500 hover:text-indigo-700"><Edit size={18} /></button>
                  <button onClick={() => onDelete(user)} className="text-red-500 hover:text-red-700"><Trash2 size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UsersTable;
