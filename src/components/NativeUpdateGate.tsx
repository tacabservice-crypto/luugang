import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

type UpdatePlugin = {
  getAppInfo(): Promise<{ versionCode: number; versionName: string }>;
  download(options: { url: string }): Promise<{ ready: boolean }>;
  install(): Promise<void>;
  addListener(event: 'downloadProgress', listener: (data: { percent: number }) => void): Promise<{ remove(): Promise<void> }>;
};

const updater = registerPlugin<UpdatePlugin>('AppUpdater');

export default function NativeUpdateGate() {
  const pluginAvailable = Capacitor.isPluginAvailable('AppUpdater');
  const [required, setRequired] = useState(() => Capacitor.isNativePlatform() && !pluginAvailable);
  const [apkUrl, setApkUrl] = useState('/downloads/LudoSom.apk');
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'ready'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/version?native=${Date.now()}`, { cache: 'no-store' });
        const latest = await response.json();
        if (!active) return;
        setApkUrl(String(latest.androidApkUrl || '/downloads/LudoSom.apk'));
        if (!pluginAvailable) return setRequired(true);
        const current = await updater.getAppInfo();
        setRequired(Number(current.versionCode) < Number(latest.nativeVersionCode || 0));
      } catch { /* Keep the installed app usable while offline. */ }
    })();
    return () => { active = false; };
  }, [pluginAvailable]);

  useEffect(() => {
    if (!pluginAvailable) return;
    let handle: { remove(): Promise<void> } | undefined;
    void updater.addListener('downloadProgress', data => setProgress(data.percent)).then(value => { handle = value; });
    return () => { void handle?.remove(); };
  }, [pluginAvailable]);

  if (!required) return null;

  const startUpdate = async () => {
    setMessage('');
    if (!pluginAvailable) {
      window.location.href = `${apkUrl}?update=${Date.now()}`;
      return;
    }
    try {
      setPhase('downloading');
      setProgress(0);
      const absoluteUrl = new URL(apkUrl, window.location.origin).toString();
      await updater.download({ url: absoluteUrl });
      setProgress(100);
      setPhase('ready');
    } catch (error) {
      setPhase('idle');
      setMessage(error instanceof Error ? error.message : 'Update-ka lama soo dejin karin.');
    }
  };

  const install = async () => {
    try { setMessage(''); await updater.install(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Install-ka lama furi karin.'); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-700 text-4xl shadow-2xl shadow-blue-500/30">🎲</div>
        <h1 className="text-2xl font-black">LudoSom Update</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">Nooc cusub oo muhiim ah ayaa diyaar ah. Cusboonaysii si app-ku si sax ah u shaqeeyo.</p>
        {phase === 'downloading' && (
          <div className="mt-7">
            <div className="mb-2 flex justify-between text-xs font-bold"><span>Downloading update…</span><span>{progress}%</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}
        {message && <p className="mt-4 text-xs font-semibold text-amber-300">{message}</p>}
        {phase === 'ready' ? (
          <button onClick={install} className="mt-7 w-full rounded-2xl bg-emerald-500 py-4 font-black text-white active:scale-95">Install</button>
        ) : phase === 'idle' ? (
          <button onClick={startUpdate} className="mt-7 w-full rounded-2xl bg-blue-600 py-4 font-black text-white active:scale-95">Update</button>
        ) : null}
      </div>
    </div>
  );
}
