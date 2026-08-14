import React, { useState, useEffect } from 'react';
import { Lock, CreditCard, UserCheck, Trash2, Edit, Power, PowerOff, ShieldCheck, Crown, Plus } from 'lucide-react';
import ChangePasswordForm from '../ChangePasswordForm';
import { isFullAdmin } from '../../utils/admin';
import { userErrorMessage } from '../../utils/userError';

const Settings = ({ 
    adminSettings, 
    paymentSettings, 
    onSavePaymentSettings, 
    onSaveVipTiers,
    onSaveAdSettings,
    onSaveOtpSettings,
    onCreateRole,
    onDeleteRole,
    onUpdateRole,
    onToggleRoleStatus,
    onEditRole,
    permissionsList,
    adminUser,
}) => {
  const [settingsView, setSettingsView] = useState('roles');
  const [editablePaymentSettings, setEditablePaymentSettings] = useState(paymentSettings);
  const [editableVipTiers, setEditableVipTiers] = useState(adminSettings?.vipTiers || {});
  const [editableAdSettings, setEditableAdSettings] = useState(adminSettings?.adSettings || { enabled: false, format: 'banner', placement: 'all', companyName: '', title: '', message: '', imageUrl: '', linkUrl: '', durationSeconds: 3, intervalSeconds: 60, adsenseClient: '', adsenseSlot: '' });
  const [otpEnabled, setOtpEnabled] = useState(adminSettings?.otpEnabled !== false);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    setEditablePaymentSettings(paymentSettings);
  }, [paymentSettings]);

  useEffect(() => setEditableVipTiers(adminSettings?.vipTiers || {}), [adminSettings?.vipTiers]);
  useEffect(() => { if (adminSettings?.adSettings) setEditableAdSettings(adminSettings.adSettings); }, [adminSettings?.adSettings]);
  useEffect(() => setOtpEnabled(adminSettings?.otpEnabled !== false), [adminSettings?.otpEnabled]);

  const updateVipTier = (key, field, value) => setEditableVipTiers(current => ({ ...current, [key]: { ...current[key], [field]: value } }));

  const handlePaymentSettingsChange = (provider, key, value) => {
    const updated = JSON.parse(JSON.stringify(editablePaymentSettings || {}));
    if (provider === 'agentFloatInstructions') {
      updated.agentFloatInstructions = value;
    } else {
      if (!updated[provider]) {
        updated[provider] = { enabled: false, apiKey: '', apiUrl: '', accountNumber: '' };
      }
      updated[provider][key] = value;
    }
    setEditablePaymentSettings(updated);
  };
  
  if (!adminSettings) {
    return <p>Loading settings...</p>;
  }

  // Fallback for payment settings if they are not loaded yet.
  if (!editablePaymentSettings) {
      // You can return a loading state or an empty state.
      // For now, let's just make sure it doesn't crash.
      return <p>Loading payment settings...</p>;
  }

  const { roles, usersByRole } = adminSettings;
  const canManageRoles = adminUser?.permissions?.includes('all');

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };
  
  return (
    <div className="w-full min-w-0 rounded-xl bg-white p-3 shadow-md sm:p-6">
      <div className="overflow-x-auto border-b border-gray-200">
        <nav className="-mb-px flex min-w-max gap-5 sm:gap-8" aria-label="Tabs">
          <button onClick={() => setSettingsView('roles')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'roles' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            Roles & Permissions
          </button>
          <button onClick={() => setSettingsView('payment')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'payment' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            Payment Settings
          </button>
          <button onClick={() => setSettingsView('vip')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'vip' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            VIP Plans
          </button>
          <button onClick={() => setSettingsView('ads')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'ads' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Ads & Notices</button>
          <button onClick={() => setSettingsView('security')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'security' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Login Security</button>
          <button onClick={() => setSettingsView('admin')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${settingsView === 'admin' ? 'border-purple-500 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
            Admin Management
          </button>
        </nav>
      </div>

       {notification && (
          <div className={`mt-4 p-4 rounded-md ${notification.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {notification.message}
          </div>
        )}

      <div className="mt-6">
        {settingsView === 'security' && (
          <div className="max-w-3xl space-y-4">
            <div><h3 className="text-xl font-bold">Email OTP Verification</h3><p className="mt-1 text-sm text-gray-500">Control whether users must receive and enter an email code during signup, legacy login, and Google onboarding.</p></div>
            <div className={`rounded-xl border p-5 ${otpEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className={`font-black ${otpEnabled ? 'text-emerald-800' : 'text-amber-900'}`}>OTP is currently {otpEnabled ? 'ENABLED' : 'DISABLED'}</p><p className="mt-1 text-sm text-gray-600">{otpEnabled ? 'Users without prior verification must confirm a code sent to their email.' : 'No OTP emails are sent. Users continue directly to login or the optional promo-code step.'}</p></div>
                <button onClick={async () => { const next = !otpEnabled; if (!window.confirm(next ? 'Enable Email OTP verification?' : 'Disable Email OTP verification for all users?')) return; try { await onSaveOtpSettings(next); setOtpEnabled(next); showNotification('success', `Email OTP ${next ? 'enabled' : 'disabled'}.`); } catch (error: any) { showNotification('error', userErrorMessage(error, 'OTP setting could not be saved.')); } }} className={`shrink-0 rounded-lg px-5 py-3 font-black text-white ${otpEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{otpEnabled ? 'Disable OTP' : 'Enable OTP'}</button>
              </div>
            </div>
            {!otpEnabled && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Security notice:</strong> Firebase password/Google authentication remains active, but the additional LudoSom email-code check is skipped.</div>}
          </div>
        )}
        {settingsView === 'ads' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><h3 className="text-xl font-bold">Ads & Live Notices</h3><p className="text-sm text-gray-500">Choose any display time from 1 second up to 3 minutes.</p></div><button onClick={async()=>{try{await onSaveAdSettings(editableAdSettings);showNotification('success','Ad settings saved.');}catch(error:any){showNotification('error',userErrorMessage(error,'Ad settings could not be saved.'));}}} className="rounded-md bg-purple-600 px-4 py-2 font-bold text-white">Save Campaign</button></div>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={!!editableAdSettings.enabled} onChange={e=>setEditableAdSettings({...editableAdSettings,enabled:e.target.checked})}/> Campaign enabled</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">Format<select value={editableAdSettings.format} onChange={e=>setEditableAdSettings({...editableAdSettings,format:e.target.value})} className="mt-1 w-full rounded border p-2"><option value="banner">Banner</option><option value="ticker">Ticker</option><option value="popup">Popup</option><option value="adsense">AdSense</option></select></label>
              <label className="text-sm">Placement<select value={editableAdSettings.placement} onChange={e=>setEditableAdSettings({...editableAdSettings,placement:e.target.value})} className="mt-1 w-full rounded border p-2"><option value="all">Dashboard & games</option><option value="dashboard">Dashboard only</option><option value="game">Games only</option></select></label>
              <label className="text-sm">Company<input value={editableAdSettings.companyName||''} onChange={e=>setEditableAdSettings({...editableAdSettings,companyName:e.target.value})} className="mt-1 w-full rounded border p-2"/></label>
              <label className="text-sm">Title<input value={editableAdSettings.title||''} onChange={e=>setEditableAdSettings({...editableAdSettings,title:e.target.value})} className="mt-1 w-full rounded border p-2"/></label>
              <label className="text-sm sm:col-span-2">Message<textarea value={editableAdSettings.message||''} onChange={e=>setEditableAdSettings({...editableAdSettings,message:e.target.value})} className="mt-1 w-full rounded border p-2" rows={3}/></label>
              <label className="text-sm">Image URL<input value={editableAdSettings.imageUrl||''} onChange={e=>setEditableAdSettings({...editableAdSettings,imageUrl:e.target.value})} className="mt-1 w-full rounded border p-2"/></label>
              <label className="text-sm">Click URL<input value={editableAdSettings.linkUrl||''} onChange={e=>setEditableAdSettings({...editableAdSettings,linkUrl:e.target.value})} className="mt-1 w-full rounded border p-2"/></label>
              <label className="text-sm">Display seconds (1–180)<input type="number" min="1" max="180" step="1" value={editableAdSettings.durationSeconds} onChange={e=>setEditableAdSettings({...editableAdSettings,durationSeconds:Number(e.target.value)})} className="mt-1 w-full rounded border p-2"/><span className="mt-1 block text-xs text-gray-500">Examples: 30 = 30 seconds, 60 = 1 minute, 180 = 3 minutes.</span></label>
              <label className="text-sm">Repeat every seconds<input type="number" min="10" max="3600" value={editableAdSettings.intervalSeconds} onChange={e=>setEditableAdSettings({...editableAdSettings,intervalSeconds:Number(e.target.value)})} className="mt-1 w-full rounded border p-2"/><span className="mt-1 block text-xs text-gray-500">If shorter than display time, it is automatically raised to prevent overlap.</span></label>
              {editableAdSettings.format==='adsense'&&<><label className="text-sm">AdSense client<input value={editableAdSettings.adsenseClient||''} onChange={e=>setEditableAdSettings({...editableAdSettings,adsenseClient:e.target.value})} className="mt-1 w-full rounded border p-2"/></label><label className="text-sm">AdSense slot<input value={editableAdSettings.adsenseSlot||''} onChange={e=>setEditableAdSettings({...editableAdSettings,adsenseSlot:e.target.value})} className="mt-1 w-full rounded border p-2"/></label></>}
            </div>
          </div>
        )}
        {settingsView === 'vip' && (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="flex items-center gap-2 text-xl font-bold"><Crown className="text-amber-500" /> VIP Plans</h3><p className="mt-1 text-sm text-gray-500">Changes saved here are shown to players and applied to game payouts.</p></div>
              <button onClick={async () => { try { await onSaveVipTiers(editableVipTiers); showNotification('success', 'VIP plans saved and synced with players.'); } catch (error:any) { showNotification('error', userErrorMessage(error, 'VIP plans could not be saved.')); } }} className="rounded-md bg-purple-600 px-4 py-2 font-bold text-white hover:bg-purple-700">Save VIP Plans</button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Object.entries(editableVipTiers).map(([key, tier]: [string, any]) => (
                <div key={key} className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between"><span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black uppercase text-purple-700">{key}</span><button onClick={() => setEditableVipTiers(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== key)))} className="text-red-500" title="Remove plan"><Trash2 size={17} /></button></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="sm:col-span-3 text-sm font-medium text-gray-700">Plan name<input value={tier.name || ''} onChange={e => updateVipTier(key, 'name', e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm font-medium text-gray-700">Price ($)<input type="number" min="0.01" step="0.01" value={tier.price} onChange={e => updateVipTier(key, 'price', Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm font-medium text-gray-700">Months<input type="number" min="1" step="1" value={tier.durationMonths} onChange={e => updateVipTier(key, 'durationMonths', Number(e.target.value))} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" /></label>
                    <label className="text-sm font-medium text-gray-700">Rake discount %<input type="number" min="0" max="10" step="0.5" value={(tier.rakeDiscount || 0) * 100} onChange={e => updateVipTier(key, 'rakeDiscount', Number(e.target.value) / 100)} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" /></label>
                    <label className="sm:col-span-3 text-sm font-medium text-gray-700">Benefits (one per line)<textarea rows={4} value={(tier.features || []).join('\n')} onChange={e => updateVipTier(key, 'features', e.target.value.split('\n'))} className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2" /></label>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => { const base = 'plan'; let index = Object.keys(editableVipTiers).length + 1; while (editableVipTiers[`${base}${index}`]) index++; setEditableVipTiers(current => ({ ...current, [`${base}${index}`]: { name: 'New VIP Plan', price: 5, durationMonths: 1, rakeDiscount: 0.01, features: ['VIP profile badge'] } })); }} className="mt-4 flex items-center gap-2 rounded-md border border-purple-300 px-4 py-2 font-bold text-purple-700 hover:bg-purple-50"><Plus size={17} /> Add Plan</button>
          </div>
        )}
        {settingsView === 'admin' && (
          <div>
            <h3 className="text-xl font-bold mb-4">Admin Management</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <h4 className='font-bold text-lg mb-2'>Change Your Password</h4>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <ChangePasswordForm
                            adminId={adminUser.id}
                            onSuccess={(message) => showNotification('success', message)}
                            onError={(message) => showNotification('error', message)}
                        />
                    </div>
                </div>
                {usersByRole && (
                    <div>
                        <h4 className='font-bold text-lg mb-2'>Admins by Role</h4>
                        <div className="space-y-4">
                        {Object.keys(usersByRole).map(roleName => (
                            <div key={roleName} className="bg-gray-50 p-4 rounded-lg">
                            <h5 className="font-semibold text-md mb-2">{roleName}</h5>
                            <ul className="space-y-2">
                                {usersByRole[roleName].map(user => {
                                const protectedAdmin = isFullAdmin(user) || roleName.toLowerCase().includes('admin');
                                return (
                                <li key={user.id} className="flex items-center justify-between p-2 bg-white rounded shadow-sm">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{user.username}</span>
                                      {protectedAdmin && (
                                        <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1">
                                          <ShieldCheck size={12} /> Full Admin
                                        </span>
                                      )}
                                    </div>
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {user.status}
                                    </span>
                                </li>
                                );
                                })}
                            </ul>
                            </div>
                        ))}
                        </div>
                    </div>
                )}
            </div>
          </div>
        )}

        {settingsView === 'payment' && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h3 className="text-xl font-bold">Payment Providers</h3>
              <button onClick={() => { onSavePaymentSettings({ providers: editablePaymentSettings, instructions: editablePaymentSettings.agentFloatInstructions }); showNotification('success', 'Payment settings saved!'); }} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
                Save Settings
              </button>
            </div>

            <div className="mt-6 bg-gray-50 p-4 rounded-lg shadow-sm">
                <h4 className="text-lg font-semibold capitalize mb-4">Agent Float Payment Instructions</h4>
                <textarea
                    rows={4}
                    className="w-full p-2 border border-gray-300 rounded-md"
                    placeholder="E.g., Bank Name: XYZ, Account Number: 12345, Mobile Money: 555-5555"
                    value={editablePaymentSettings.agentFloatInstructions || ''}
                    onChange={(e) => handlePaymentSettingsChange('agentFloatInstructions', 'value', e.target.value)}
                />
            </div>

            <div className="space-y-6 mt-6">
              {Object.entries(editablePaymentSettings || {}).filter(([key]) => key !== 'agentFloatInstructions').map(([provider, config]: [string, any]) => (
                <div key={provider} className="bg-gray-50 p-4 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold capitalize">{provider}</h4>
                    <label className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={!!config.enabled}
                          onChange={e => handlePaymentSettingsChange(provider, 'enabled', e.target.checked)}
                        />
                        <div className={`block w-14 h-8 rounded-full ${config.enabled ? 'bg-purple-600' : 'bg-gray-300'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${config.enabled ? 'transform translate-x-6' : ''}`}></div>
                      </div>
                      <div className="ml-3 text-gray-700 font-medium">
                        {config.enabled ? 'Enabled' : 'Disabled'}
                      </div>
                    </label>
                  </div>
                  {config.enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">API Key</label>
                          <input
                            type="text"
                            value={config.apiKey || ''}
                            onChange={(e) => handlePaymentSettingsChange(provider, 'apiKey', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">API URL</label>
                          <input
                            type="text"
                            value={config.apiUrl || ''}
                            onChange={(e) => handlePaymentSettingsChange(provider, 'apiUrl', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                          />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Admin Deposit Number / Merchant ID</label>
                          <input
                            type="text"
                            value={config.accountNumber || ''}
                            onChange={(e) => handlePaymentSettingsChange(provider, 'accountNumber', e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                          />
                        </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {settingsView === 'roles' && (
          <div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h3 className="text-xl font-bold">Roles & Permissions</h3>
              {canManageRoles && <button onClick={onCreateRole} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md">Create New Role</button>}
            </div>
            {!canManageRoles && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">You can view roles, but only a Full Admin can create, edit, suspend, or delete them.</div>}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-[760px] w-full bg-white">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permissions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {roles?.map((role:any) => {
                    const protectedRole = isFullAdmin(role);
                    return (
                    <tr key={role.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span>{role.name}</span>
                          {protectedRole && (
                            <span className="px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1">
                              <ShieldCheck size={12} /> Full Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-wrap gap-1">
                          {role.permissions.map((p:string) => <span key={p} className="px-2 py-1 bg-gray-200 text-gray-800 rounded-full text-xs">{p}</span>)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{role.permissions?.includes('cashier') ? ((role.cashierLocations?.length ? role.cashierLocations : [role.location]).filter(Boolean).join(' / ') || 'Not set') : '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${role.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {role.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {protectedRole || !canManageRoles ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-bold cursor-not-allowed" title="Full Admin role is protected and cannot be edited, suspended, or deleted">
                            🔒 Protected
                          </span>
                        ) : (
                          <div className="flex items-center justify-end space-x-2">
                              <button onClick={() => onEditRole(role)} className="text-indigo-600 hover:text-indigo-900"><Edit size={18} /></button>
                              <button onClick={() => onToggleRoleStatus(role)} className={role.status === 'active' ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}>
                                  {role.status === 'active' ? <PowerOff size={18} /> : <Power size={18} />}
                              </button>
                              <button onClick={() => onDeleteRole(role)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
