import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const INSTALL_DISMISSED_KEY = 'dhili-ludo-install-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;
const APK_DOWNLOAD_URL = '/downloads/LudoSom.apk';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPwaPrompt = () => {
  const [shouldRender, setShouldRender] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useBodyScrollLock(shouldRender);

  useEffect(() => {
    const isNativeApp = Capacitor.isNativePlatform();
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    const dismissedUntil = Number(window.localStorage.getItem(INSTALL_DISMISSED_KEY) || '0');

    setShouldRender(
      !isNativeApp
      && !isStandalone
      && dismissedUntil <= Date.now(),
    );

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => setShouldRender(false);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(
      INSTALL_DISMISSED_KEY,
      String(Date.now() + DISMISS_DURATION_MS),
    );
    setShouldRender(false);
  };

  const installApp = async () => {
    const userAgent = navigator.userAgent || '';
    if (/Android/i.test(userAgent)) {
      const link = document.createElement('a');
      link.href = APK_DOWNLOAD_URL;
      link.download = 'LudoSom.apk';
      document.body.appendChild(link);
      link.click();
      link.remove();
      dismiss();
      return;
    }

    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') dismiss();
      setInstallPrompt(null);
      return;
    }

    if (/iPad|iPhone|iPod/i.test(userAgent)) {
      window.alert('Tap Share, then choose “Add to Home Screen”.');
      return;
    }

    window.alert('Open your browser menu and choose “Install app”.');
  };

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-5 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-app-title"
        className="relative w-full max-w-sm rounded-3xl bg-white px-6 py-7 text-center text-slate-900 shadow-2xl ring-1 ring-black/5 animate-in zoom-in-95 duration-200"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Smartphone className="h-8 w-8" />
        </div>
        <h2 id="install-app-title" className="mt-5 text-xl font-black">Get the LudoSom App</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          Install the Android app for a faster, smoother game experience.
        </p>
        <button
          type="button"
          onClick={installApp}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          Install
        </button>
      </div>
    </div>
  );
};

export default InstallPwaPrompt;
