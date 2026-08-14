import React, { useState, useEffect } from 'react';
import { isFullAdmin } from '../utils/admin';
import LocationPicker from './LocationPicker';

interface EditRoleModalProps {
    isOpen: boolean;
    role: {
        id: string;
        name: string;
        username?: string;
        permissions: string[];
        status: 'active' | 'suspended';
        location?: string;
        cashierMonthlySalary?: number;
        cashierMonthlyTarget?: number;
        cashierTargetBonus?: number;
    } | null;
    permissionsList: string[];
    onClose: () => void;
    onUpdateRole: (roleId: string, updatedData: any) => Promise<void>;
    onCreateRole: (newRoleData: any) => Promise<void>;
}

const EditRoleModal: React.FC<EditRoleModalProps> = ({ isOpen, role, permissionsList, onClose, onUpdateRole, onCreateRole }) => {
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
        permissions: [],
        location: '',
        cashierMonthlySalary: '',
        cashierMonthlyTarget: '',
        cashierTargetBonus: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (role) {
            setFormData({
                name: role.name,
                username: role.username,
                password: '', // Password is not edited here for security, can be a separate feature
                permissions: [...role.permissions],
                location: role.location || '',
                cashierMonthlySalary: String(role.cashierMonthlySalary || ''),
                cashierMonthlyTarget: String(role.cashierMonthlyTarget || ''),
                cashierTargetBonus: String(role.cashierTargetBonus || ''),
            });
        } else {
            setFormData({ name: '', username: '', password: '', permissions: [], location: '', cashierMonthlySalary: '', cashierMonthlyTarget: '', cashierTargetBonus: '' });
        }
    }, [role, isOpen]);

    const isProtected = role ? isFullAdmin(role) : false;

    if (!isOpen) return null;

    const handlePermissionChange = (permission: string) => {
        if (isProtected) return;
        setFormData(prev => {
            const newPermissions = prev.permissions.includes(permission)
                ? prev.permissions.filter(p => p !== permission)
                : [...prev.permissions, permission];
            return { ...prev, permissions: newPermissions };
        });
    };

    const handleSave = async () => {
        if (isProtected) {
            setError('Full Admin accounts are protected and cannot be edited, suspended, or deleted.');
            return;
        }
        setError(null);
        if (!formData.name.trim() || !formData.username?.trim()) {
            setError('Role name and username are required.');
            return;
        }
        if (!role && formData.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (formData.permissions.length === 0) {
            setError('Select at least one permission.');
            return;
        }
        if (formData.permissions.includes('cashier') && !formData.location.trim()) {
            setError('Cashier city/location is required.');
            return;
        }
        setIsSaving(true);
        try {
            if (role) { // We are editing
                await onUpdateRole(role.id, formData);
            } else { // We are creating
                await onCreateRole(formData);
            }
            onClose();
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-3">
            <div className="bg-gray-800 rounded-xl shadow-xl p-4 sm:p-6 w-full max-w-2xl max-h-[92vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4 text-white">{role ? `Edit Role: ${role.name}` : 'Create New Role'}</h2>
                
                {isProtected && (
                    <div className="p-3 mb-4 bg-amber-900/50 border border-amber-500/50 rounded text-amber-200 text-sm flex items-center gap-2">
                        <span>🔒 Full Admin accounts are protected and cannot be edited, suspended, or deleted.</span>
                    </div>
                )}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Role Name</label>
                        <input 
                            type="text" 
                            name="name" 
                            value={formData.name} 
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} 
                            className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Username</label>
                        <input 
                            type="text" 
                            name="username" 
                            value={formData.username} 
                            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))} 
                            className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" 
                        />
                    </div>
                    {!role && ( // Only show password field when creating a new role
                         <div>
                            <label className="block text-sm font-medium text-gray-400">Password</label>
                            <input 
                                type="password" 
                                name="password" 
                                value={formData.password} 
                                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} 
                                className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-1" 
                            />
                        </div>
                    )}
                    <div>
                        <h3 className="text-lg font-bold text-white mb-2">Permissions</h3>
                        <p className="mb-3 text-xs text-gray-400">Choose only the dashboard sections this admin should access. Backend APIs enforce the same permissions.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {permissionsList.map(permission => (
                                <label key={permission} className="flex items-center space-x-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                                    <input
                                        type="checkbox"
                                        checked={formData.permissions.includes(permission)}
                                        onChange={() => handlePermissionChange(permission)}
                                        className="form-checkbox h-5 w-5 text-purple-600 bg-gray-700 border-gray-600 rounded"
                                    />
                                    <span className="text-white capitalize">{permission === 'stats' ? 'Dashboard statistics' : permission.replace('-', ' ')}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {formData.permissions.includes('cashier') && (
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Cashier City / Location</label>
                            <p className="mt-1 text-xs text-gray-500">Only unlinked player requests from this city will be assigned to this cashier.</p>
                            <LocationPicker value={formData.location} onChange={(location) => setFormData(prev => ({ ...prev, location }))} className="bg-gray-700 text-white w-full px-3 py-2 rounded mt-2" />
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <label className="text-xs text-gray-400">Monthly Salary ($)<input type="number" min="0" step="0.01" value={formData.cashierMonthlySalary} onChange={(e) => setFormData(prev => ({ ...prev, cashierMonthlySalary: e.target.value }))} className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white" /></label>
                                <label className="text-xs text-gray-400">Approved Target<input type="number" min="0" step="1" value={formData.cashierMonthlyTarget} onChange={(e) => setFormData(prev => ({ ...prev, cashierMonthlyTarget: e.target.value }))} className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white" /></label>
                                <label className="text-xs text-gray-400">Target Bonus ($)<input type="number" min="0" step="0.01" value={formData.cashierTargetBonus} onChange={(e) => setFormData(prev => ({ ...prev, cashierTargetBonus: e.target.value }))} className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white" /></label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:items-center">
                    <button onClick={onClose} className="w-full sm:w-auto bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving || isProtected}
                        className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:bg-purple-400 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Kaydinaya...' : 'Save Changes'}
                    </button>
                </div>
                {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            </div>
        </div>
    );
};

export default EditRoleModal;
