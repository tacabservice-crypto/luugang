import React, { useState } from 'react';
import { UserProfile } from '../types/game';
import { isFullAdmin } from '../utils/admin';
import FirebasePasswordSettings from './FirebasePasswordSettings';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Camera, Check, Eye, LockKeyhole, MessageCircle, Save, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
import AvatarDisplay from './AvatarDisplay';
import { useLanguage } from '../context/LanguageContext';

interface Role {
    id: string;
    name: string;
}

interface UserEditModalProps {
    user: UserProfile;
    onClose: () => void;
    onSave: (updatedUser: Partial<UserProfile>) => Promise<void>;
    isAdmin?: boolean;
    roles?: Role[];
}

const AVATARS = ['/ludosom-logo.png', '😀', '😎', '🚀', '🧠', '👑', '💪', '🎉', '🔥', '💯', '🎲', '🤔','😂','😃','😄','😅','😆','😉','😊','😋','😌','😍','😏','😐','😑','😒','😓','pensive','😕','😖','😗','😘','😙','😚','😛','😜','😝','😞','😟','😠','😡','😢','😣','😤','😥','😦','😧','😨','😩','😪','😫','😬','😭','😮','😯','😰','😱','😲','😳','😴','😵','😶','😷'];

const UserEditModal: React.FC<UserEditModalProps> = ({ user, onClose, onSave, isAdmin = false, roles = [] }) => {
    useBodyScrollLock();
    const { language } = useLanguage();
    const so = language === 'so';
    const isProtected = isFullAdmin(user);
    const [formData, setFormData] = useState({
        username: user.username,
        avatar: user.avatar,
        role: user.role || 'player',
        profileCover: user.profileCover || 'royal',
        allowProfilePreview: user.allowProfilePreview !== false,
        allowDirectMessages: user.allowDirectMessages !== false,
    });
    const [newPassword, setNewPassword] = useState('');
    const [uploadedAvatar, setUploadedAvatar] = useState('');
    const [avatarType, setAvatarType] = useState<'emoji' | 'upload'>(user.avatar?.startsWith('/uploads/avatars/') || user.avatar?.startsWith('/api/profile-images/') || /^https?:\/\//i.test(user.avatar || '') ? 'upload' : 'emoji');
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAvatarSelect = (avatar: string) => {
        setFormData(prev => ({ ...prev, avatar }));
        setAvatarType('emoji');
    };

    const handleSave = async () => {
        if (isProtected) {
            setError('Full Admin accounts are protected and cannot be edited, suspended, or deleted.');
            return;
        }
        setError(null);
        setIsSaving(true);
        const dataToSave: Partial<UserProfile> = { ...formData };
        
        if (newPassword) {
            dataToSave.password = newPassword;
        }

        if (avatarType === 'upload' && uploadedAvatar) {
            dataToSave.avatar = uploadedAvatar;
        }
        try {
            await onSave(dataToSave);
            onClose();
        } catch (e: any) {
            setError(e.message || 'An unexpected error occurred.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarUpload = async (file?: File) => {
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setError(so ? 'Dooro sawir JPEG, PNG ama WebP ah.' : 'Choose a JPEG, PNG or WebP image.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError(so ? 'Sawirku waa inuu ka yar yahay 2MB.' : 'The image must be smaller than 2MB.');
            return;
        }
        setError(null);
        setIsUploadingAvatar(true);
        try {
            const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/avatar`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.avatar) throw new Error(data.error || 'Avatar upload failed.');
            setUploadedAvatar(data.avatar);
            setFormData(previous => ({ ...previous, avatar: data.avatar }));
            setAvatarType('upload');
        } catch (uploadError: any) {
            setError(uploadError?.message || (so ? 'Sawirka lama kaydin karin.' : 'The image could not be saved.'));
        } finally {
            setIsUploadingAvatar(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const previewAvatar = uploadedAvatar || formData.avatar;
    return <div className="fixed inset-0 z-[160] flex items-stretch justify-center overscroll-none bg-[#02010a]/85 p-0 backdrop-blur-md sm:items-center sm:p-4">
        <section role="dialog" aria-modal="true" aria-label={so ? 'Habaynta profile-ka' : 'Profile settings'} className="flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden border-purple-400/20 bg-gradient-to-b from-[#171035] via-[#0d0920] to-[#070511] text-white shadow-[0_0_80px_rgba(88,28,135,.35)] sm:h-auto sm:max-h-[94dvh] sm:rounded-[30px] sm:border">
            <header className="relative shrink-0 overflow-hidden border-b border-white/10 px-5 pb-5 pt-4">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(250,204,21,.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,.22),transparent_38%)]" />
                <div className="relative flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/15"><Sparkles className="h-4 w-4 text-yellow-300" /></span><div><h2 className="text-sm font-black">{isAdmin ? `Edit ${user.username}` : (so ? 'Habaynta Profile-ka' : 'Profile Settings')}</h2><p className="text-[9px] font-bold uppercase tracking-[.18em] text-purple-300">{so ? 'Muuqaalkaaga LudoSom' : 'Your LudoSom identity'}</p></div></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-slate-300 transition hover:bg-white/10"><X className="h-4 w-4" /></button></div>
                <div className="relative mt-5 flex items-center gap-4"><div className="relative"><div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-yellow-300 via-purple-500 to-blue-500 opacity-70 blur-sm" /><AvatarDisplay avatar={previewAvatar} username={formData.username} className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-[#100a29] object-cover shadow-xl" textClassName="text-4xl" /><button type="button" disabled={isUploadingAvatar} onClick={() => fileInputRef.current?.click()} aria-label={so ? 'Sawir soo geli' : 'Upload profile photo'} className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#171035] bg-yellow-400 text-slate-950 shadow-lg transition active:scale-90 disabled:opacity-60">{isUploadingAvatar ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" /> : <Camera className="h-4 w-4" />}</button><input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="hidden" onChange={event => void handleAvatarUpload(event.target.files?.[0])} /></div><div className="min-w-0"><h3 className="truncate text-xl font-black">{formData.username || user.username}</h3><p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> {so ? 'Profile ammaan ah' : 'Protected player profile'}</p><p className="mt-2 text-[10px] leading-5 text-slate-400">{isUploadingAvatar ? (so ? 'Sawirka server-ka ayaa lagu kaydinayaa…' : 'Saving photo to the server…') : (so ? 'Taabo camera-da si aad sawir dhab ah u geliso.' : 'Tap the camera to upload a real profile photo.')}</p></div></div>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 touch-pan-y [-webkit-overflow-scrolling:touch] sm:px-5">
                {isProtected && <div className="flex gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs font-bold text-amber-200"><LockKeyhole className="h-4 w-4 shrink-0" /> Full Admin accounts are protected and cannot be edited.</div>}
                <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4"><label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><UserRound className="h-3.5 w-3.5 text-purple-300" /> {so ? 'Magaca Ciyaarta' : 'Player Name'}</label><input type="text" name="username" value={formData.username} onChange={event => setFormData(prev => ({ ...prev, username: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-500/15" /></div>

                {!isAdmin && <>
                    <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4">
                        <h3 className="text-xs font-black">{so ? 'Bogga Ciyaaryahanka' : 'Player Card'}</h3>
                        <p className="mt-1 text-[9px] text-slate-500">{so ? 'Dooro cover-ka iyo cidda arki karta xogtaada.' : 'Choose your cover and who can open your details.'}</p>
                        <div className="mt-3 grid grid-cols-4 gap-2">{['royal','ocean','sunset','emerald'].map(cover => <button key={cover} type="button" aria-label={cover} onClick={() => setFormData(previous => ({...previous, profileCover: cover}))} className={`h-10 rounded-xl border ${formData.profileCover === cover ? 'border-yellow-300 ring-2 ring-yellow-300/20' : 'border-white/10'} ${cover === 'royal' ? 'bg-gradient-to-r from-purple-700 to-indigo-600' : cover === 'ocean' ? 'bg-gradient-to-r from-cyan-600 to-blue-700' : cover === 'sunset' ? 'bg-gradient-to-r from-orange-500 to-fuchsia-700' : 'bg-gradient-to-r from-emerald-500 to-teal-800'}`} />)}</div>
                        <div className="mt-4 space-y-2">
                            <label className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5"><span className="flex items-center gap-2 text-[10px] font-bold"><Eye className="h-4 w-4 text-purple-300" />{so ? 'Avatar-kayga xog ha laga furo' : 'Allow profile preview'}</span><input type="checkbox" checked={formData.allowProfilePreview} onChange={event => setFormData(previous => ({...previous, allowProfilePreview: event.target.checked}))} className="h-4 w-4 accent-purple-500" /></label>
                            <label className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5"><span className="flex items-center gap-2 text-[10px] font-bold"><MessageCircle className="h-4 w-4 text-blue-300" />{so ? 'Dadku fariin ha ii soo diri karaan' : 'Allow player messages'}</span><input type="checkbox" checked={formData.allowDirectMessages} onChange={event => setFormData(previous => ({...previous, allowDirectMessages: event.target.checked}))} className="h-4 w-4 accent-blue-500" /></label>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-black">{so ? 'Dooro Astaantaada' : 'Choose Your Avatar'}</h3><p className="mt-1 text-[9px] font-semibold text-slate-500">{so ? 'Emoji ama sawir kuu gaar ah' : 'Use an emoji or your own photo'}</p></div><div className="flex rounded-xl border border-white/10 bg-black/25 p-1"><button type="button" onClick={() => setAvatarType('emoji')} className={`rounded-lg px-3 py-1.5 text-[9px] font-black transition ${avatarType === 'emoji' ? 'bg-purple-500 text-white shadow' : 'text-slate-400'}`}>Emoji</button><button type="button" onClick={() => { setAvatarType('upload'); fileInputRef.current?.click(); }} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[9px] font-black transition ${avatarType === 'upload' ? 'bg-purple-500 text-white shadow' : 'text-slate-400'}`}><Camera className="h-3 w-3" /> {so ? 'Sawir' : 'Photo'}</button></div></div>
                    {avatarType === 'emoji' ? <div className="grid max-h-52 grid-cols-7 gap-2 overflow-y-auto rounded-xl border border-white/[.06] bg-black/20 p-2.5 sm:grid-cols-8">{AVATARS.map(avatar => <button type="button" key={avatar} onClick={() => handleAvatarSelect(avatar)} className={`relative flex aspect-square items-center justify-center rounded-xl text-xl transition active:scale-90 ${formData.avatar === avatar ? 'bg-gradient-to-br from-purple-500 to-blue-500 ring-2 ring-yellow-300/70' : 'bg-white/[.04] hover:bg-white/10'}`}>{avatar.startsWith('/') ? <img src={avatar} alt="LudoSom avatar" className="h-8 w-8 rounded-lg object-cover" /> : avatar}{formData.avatar === avatar && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-yellow-200" />}</button>)}</div> : <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingAvatar} className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-blue-400/30 bg-blue-500/[.06] px-4 py-7 text-center transition hover:bg-blue-500/10 disabled:opacity-60"><Camera className="h-7 w-7 text-blue-300" /><span className="mt-2 text-xs font-black">{isUploadingAvatar ? (so ? 'Kaydinaya sawirka…' : 'Uploading photo…') : (so ? 'Ka dooro sawir telefoonka' : 'Choose a photo from your device')}</span><span className="mt-1 text-[9px] font-semibold text-slate-500">JPEG, PNG, WebP · Max 2MB</span></button>}
                    </div>
                    <FirebasePasswordSettings />
                </>}

                {isAdmin && <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[.045] p-4"><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Role</label><select name="role" value={formData.role} onChange={event => setFormData(prev => ({ ...prev, role: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 text-white"><option value="player">Player</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><div><label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Set/Reset Password</label><input type="text" name="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Enter new password (optional)" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white" /></div></div>}
                {error && <p className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs font-bold text-red-300">{error}</p>}
            </div>

            <footer className="grid shrink-0 grid-cols-[.8fr_1.2fr] gap-2 border-t border-white/10 bg-[#090617]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-black text-slate-300 transition active:scale-95">{so ? 'Ka Noqo' : 'Cancel'}</button><button type="button" onClick={handleSave} disabled={isSaving || isProtected || !formData.username.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 py-3 text-xs font-black text-white shadow-lg shadow-purple-900/30 transition active:scale-95 disabled:opacity-45"><Save className="h-4 w-4" /> {isSaving ? (so ? 'Kaydinaya…' : 'Saving…') : (so ? 'Kaydi Isbeddelka' : 'Save Changes')}</button></footer>
        </section>
    </div>;
};

export default UserEditModal;
