import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users, Home, BarChart2, Settings, LogOut, Code, Edit, Trophy, Menu, X, WalletCards } from 'lucide-react';

const AdminLayout = ({ user, onLogout, view, setView, hasPermission, children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigationItems = [
    { name: 'stats', label: 'Stats', icon: BarChart2, permission: 'stats' },
    { name: 'users', label: 'Users', icon: Users, permission: 'users' },
    { name: 'rooms', label: 'Rooms', icon: Home, permission: 'rooms' },
    { name: 'transactions', label: 'Transactions', icon: Code, permission: 'transactions' },
    { name: 'manual-transactions', label: 'Manual Transactions', icon: Edit, permission: 'transactions' },
    { name: 'agents', label: 'Agents', icon: ShieldCheck, permission: 'agents' },
    { name: 'agent-requests', label: 'Agent Float Requests', icon: WalletCards, permission: 'agents' },
    { name: 'tournaments', label: 'Tournaments', icon: Trophy, permission: 'tournaments' },
    { name: 'settings', label: 'Settings', icon: Settings, permission: 'settings' },
  ];

  useEffect(() => setMobileOpen(false), [view]);

  const sidebar = (
    <div className="flex h-full w-72 max-w-[86vw] flex-col bg-gray-900 text-white shadow-2xl lg:w-64">
      <div className="flex items-center justify-between border-b border-gray-700 p-4">
        <div><h2 className="text-xl font-bold">Admin Panel</h2><p className="text-sm text-gray-400">Ludo Game</p></div>
        <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 hover:bg-gray-800 lg:hidden" aria-label="Close menu"><X size={20} /></button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {navigationItems.map(item => hasPermission(item.permission) && (
          <button key={item.name} onClick={() => setView(item.name)} className={`my-1 flex w-full items-center rounded-lg p-3 text-left transition-colors ${view === item.name ? 'bg-purple-600' : 'hover:bg-gray-800'}`}>
            <item.icon className="mr-3 shrink-0" size={20} /><span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="border-t border-gray-700 p-3">
        <div className="mb-2 flex min-w-0 items-center rounded-lg bg-gray-800/60 p-2">
          <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-600 font-bold">{user.username.charAt(0).toUpperCase()}</div>
          <div className="min-w-0"><span className="block truncate font-semibold">{user.username}</span><span className="block truncate text-xs text-gray-400">{user.role || user.name || 'Admin'}</span></div>
        </div>
        <button onClick={onLogout} className="flex w-full items-center rounded-lg p-3 hover:bg-red-700"><LogOut className="mr-3" size={20} />Logout</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-gray-100 font-sans">
      <aside className="hidden h-screen shrink-0 lg:block lg:sticky lg:top-0">{sidebar}</aside>
      {mobileOpen && <div className="fixed inset-0 z-50 flex lg:hidden"><button className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay"/><aside className="relative z-10 h-full">{sidebar}</aside></div>}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg border border-gray-200 p-2 text-gray-700 lg:hidden" aria-label="Open menu"><Menu size={22}/></button>
            <div className="min-w-0"><h1 className="truncate text-lg font-bold capitalize text-gray-800 sm:text-2xl">{view.replaceAll('-', ' ')}</h1><p className="hidden text-xs text-gray-500 sm:block">Manage and monitor your platform</p></div>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-100">{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
