import React, { useState } from 'react';
import { UserProfile } from '../types/game';
import { isFullAdmin } from '../utils/admin';
import FirebasePasswordSettings from './FirebasePasswordSettings';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { Camera, Check, Link2, LockKeyhole, Save, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react';
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
    });
    const [newPassword, setNewPassword] = useState('');
    const [customAvatar, setCustomAvatar] = useState('');
    const [avatarType, setAvatarType] = useState<'emoji' | 'url'>('emoji');
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

        if (avatarType === 'url' && customAvatar) {
            dataToSave.avatar = customAvatar;
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

    const previewAvatar = avatarType === 'url' && customAvatar ? customAvatar : formData.avatar;
    return <div className="fixed inset-0 z-[160] flex items-end justify-center overscroll-none bg-[#02010a]/85 px-0 pt-8 backdrop-blur-md sm:items-center sm:p-4">
        <section role="dialog" aria-modal="true" aria-label={so ? 'Habaynta profile-ka' : 'Profile settings'} className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[30px] border border-purple-400/20 bg-gradient-to-b from-[#171035] via-[#0d0920] to-[#070511] text-white shadow-[0_0_80px_rgba(88,28,135,.35)] sm:rounded-[30px]">
            <header className="relative shrink-0 overflow-hidden border-b border-white/10 px-5 pb-5 pt-4">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(250,204,21,.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(59,130,246,.22),transparent_38%)]" />
                <div className="relative flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/15"><Sparkles className="h-4 w-4 text-yellow-300" /></span><div><h2 className="text-sm font-black">{isAdmin ? `Edit ${user.username}` : (so ? 'Habaynta Profile-ka' : 'Profile Settings')}</h2><p className="text-[9px] font-bold uppercase tracking-[.18em] text-purple-300">{so ? 'Muuqaalkaaga LudoSom' : 'Your LudoSom identity'}</p></div></div><button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-slate-300 transition hover:bg-white/10"><X className="h-4 w-4" /></button></div>
                <div className="relative mt-5 flex items-center gap-4"><div className="relative"><div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-yellow-300 via-purple-500 to-blue-500 opacity-70 blur-sm" /><AvatarDisplay avatar={previewAvatar} username={formData.username} className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-[#100a29] object-cover shadow-xl" textClassName="text-4xl" /><span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[#171035] bg-yellow-400 text-slate-950"><Camera className="h-4 w-4" /></span></div><div className="min-w-0"><h3 className="truncate text-xl font-black">{formData.username || user.username}</h3><p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> {so ? 'Profile ammaan ah' : 'Protected player profile'}</p><p className="mt-2 text-[10px] leading-5 text-slate-400">{so ? 'Dooro magaca iyo astaanta lagugu arki doono ciyaaraha.' : 'Choose the name and avatar other players see in matches.'}</p></div></div>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 touch-pan-y [-webkit-overflow-scrolling:touch] sm:px-5">
                {isProtected && <div className="flex gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs font-bold text-amber-200"><LockKeyhole className="h-4 w-4 shrink-0" /> Full Admin accounts are protected and cannot be edited.</div>}
                <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4"><label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400"><UserRound className="h-3.5 w-3.5 text-purple-300" /> {so ? 'Magaca Ciyaarta' : 'Player Name'}</label><input type="text" name="username" value={formData.username} onChange={event => setFormData(prev => ({ ...prev, username: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-500/15" /></div>

                {!isAdmin && <>
                    <div className="rounded-2xl border border-white/10 bg-white/[.045] p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-black">{so ? 'Dooro Astaantaada' : 'Choose Your Avatar'}</h3><p className="mt-1 text-[9px] font-semibold text-slate-500">{so ? 'Emoji ama sawir kuu gaar ah' : 'Use an emoji or your own image'}</p></div><div className="flex rounded-xl border border-white/10 bg-black/25 p-1"><button type="button" onClick={() => setAvatarType('emoji')} className={`rounded-lg px-3 py-1.5 text-[9px] font-black transition ${avatarType === 'emoji' ? 'bg-purple-500 text-white shadow' : 'text-slate-400'}`}>Emoji</button><button type="button" onClick={() => setAvatarType('url')} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[9px] font-black transition ${avatarType === 'url' ? 'bg-purple-500 text-white shadow' : 'text-slate-400'}`}><Link2 className="h-3 w-3" /> URL</button></div></div>
                    {avatarType === 'emoji' ? <div className="grid max-h-52 grid-cols-7 gap-2 overflow-y-auto rounded-xl border border-white/[.06] bg-black/20 p-2.5 sm:grid-cols-8">{AVATARS.map(avatar => <button type="button" key={avatar} onClick={() => handleAvatarSelect(avatar)} className={`relative flex aspect-square items-center justify-center rounded-xl text-xl transition active:scale-90 ${formData.avatar === avatar ? 'bg-gradient-to-br from-purple-500 to-blue-500 ring-2 ring-yellow-300/70' : 'bg-white/[.04] hover:bg-white/10'}`}>{avatar.startsWith('/') ? <img src={avatar} alt="LudoSom avatar" className="h-8 w-8 rounded-lg object-cover" /> : avatar}{formData.avatar === avatar && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-yellow-200" />}</button>)}</div> : <div className="space-y-3"><div className="flex items-center rounded-xl border border-white/10 bg-black/30 px-3 focus-within:border-blue-400"><Link2 className="h-4 w-4 shrink-0 text-blue-300" /><input type="url" value={customAvatar} onChange={event => setCustomAvatar(event.target.value)} placeholder="https://example.com/avatar.png" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-xs text-white outline-none" /></div>{customAvatar && <p className="text-[9px] font-bold text-emerald-300">{so ? 'Sawirka kore ayaa ah muuqaalka cusub.' : 'The preview above shows your new image.'}</p>}</div>}
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
