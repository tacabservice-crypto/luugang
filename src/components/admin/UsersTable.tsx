
import React from 'react';
import { Edit, Trash2, Eye, History, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '../../utils/number';
import { isFullAdmin } from '../../utils/admin';
import { UserProfile } from '../../types/game';

interface UsersTableProps {
  users: UserProfile[];
  onEdit: (user: UserProfile) => void;
  onDelete: (user: UserProfile) => void;
  onImpersonate: (user: UserProfile) => void;
  onViewGames?: (user: UserProfile) => void;
}

const UserAvatar: React.FC<{ user: UserProfile }> = ({ user }) => {
  const avatar = String(user.avatar || '').trim();
  const isImage = /^(https?:\/\/|data:image\/|blob:)/i.test(avatar);
  return (
    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xl shadow-sm">
      {isImage ? <img src={avatar} alt={user.username || 'User'} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : (avatar || '🎮')}
    </span>
  );
};

const UsersTable: React.FC<UsersTableProps> = ({ users, onEdit, onDelete, onImpersonate, onViewGames }) => {
  return (
    <div className="w-full min-w-0 bg-white p-3 sm:p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-bold mb-4 text-gray-800">Users</h3>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full divide-y divide-gray-200">
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
            {users.map(user => {
              const protectedUser = isFullAdmin(user);
              return (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 flex items-center">
                  <UserAvatar user={user} />
                  <div className="flex items-center gap-2">
                    <span>{user.username}</span>
                    {protectedUser && (
                      <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1">
                        <ShieldCheck size={12} /> Full Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-semibold">{formatCurrency(user.balance)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.winCount} / {user.lossCount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-600">{user.role || 'Player'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button onClick={() => onViewGames(user)} className="text-gray-500 hover:text-gray-700" title="View Games"><History size={18} /></button>
                  {protectedUser ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-bold cursor-not-allowed" title="Full Admin user is protected and cannot be edited, suspended, or deleted">
                      🔒 Protected
                    </span>
                  ) : (
                    <>
                      <button onClick={() => onImpersonate(user)} className="text-blue-500 hover:text-blue-700" title="Impersonate"><Eye size={18} /></button>
                      <button onClick={() => onEdit(user)} className="text-indigo-500 hover:text-indigo-700" title="Edit User"><Edit size={18} /></button>
                      <button onClick={() => onDelete(user)} className="text-red-500 hover:text-red-700" title="Delete User"><Trash2 size={18} /></button>
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

export default UsersTable;
