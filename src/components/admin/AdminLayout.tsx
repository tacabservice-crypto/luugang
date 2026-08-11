import React from 'react';
import { ShieldCheck, Users, Home, BarChart2, Settings, LogOut, Code, Edit, Trophy } from 'lucide-react';

const AdminLayout = ({ user, onLogout, view, setView, hasPermission, children }) => {
  const navigationItems = [
    { name: 'stats', label: 'Stats', icon: BarChart2, permission: 'stats' },
    { name: 'users', label: 'Users', icon: Users, permission: 'users' },
    { name: 'rooms', label: 'Rooms', icon: Home, permission: 'rooms' },
    { name: 'transactions', label: 'Transactions', icon: Code, permission: 'transactions' },
    { name: 'manual-transactions', label: 'Manual Transactions', icon: Edit, permission: 'transactions' },
    { name: 'agents', label: 'Agents', icon: ShieldCheck, permission: 'agents' },
    { name: 'tournaments', label: 'Tournaments', icon: Trophy, permission: 'stats' },
    { name: 'settings', label: 'Settings', icon: Settings, permission: 'settings' },
  ];

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold">Admin Panel</h2>
          <p className="text-sm text-gray-400">Ludo Game</p>
        </div>
        <nav className="flex-1 p-2">
          {navigationItems.map(item =>
            hasPermission(item.permission) && (
              <button
                key={item.name}
                onClick={() => setView(item.name)}
                className={`w-full flex items-center p-3 my-1 rounded-lg transition-colors ${
                  view === item.name ? 'bg-purple-600' : 'hover:bg-gray-700'
                }`}
              >
                <item.icon className="mr-3" size={20} />
                {item.label}
              </button>
            )
          )}
        </nav>
        <div className="p-4 border-t border-gray-700">
            <div className='flex items-center mb-2'>
                <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold mr-3">
                    {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <span className="text-white font-semibold block">{user.username}</span>
                    <span className="text-gray-400 text-xs">{user.role || 'Admin'}</span>
                </div>
            </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center p-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <LogOut className="mr-3" size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm">
          <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800 capitalize">{view.replace('-', ' ')}</h1>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200">
            {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
