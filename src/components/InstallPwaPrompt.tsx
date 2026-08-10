import React, { useState, useEffect } from 'react';
import { X, Smartphone, MonitorSmartphone, Share } from 'lucide-react';

const INSTALL_DISMISSED_KEY = 'dhili-ludo-install-dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

const InstallPwaPrompt = () => {
  const [installPrompt, setInstallPrompt] = useState<any | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
   const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
   setIsStandalone(isStandaloneMode);

   const dismissedUntil = Number(window.localStorage.getItem(INSTALL_DISMISSED_KEY) || '0');
   const hasDismissedRecently = Boolean(dismissedUntil && dismissedUntil > Date.now());
   setIsDismissed(hasDismissedRecently);

   const handleBeforeInstallPrompt = (event: Event) => {
     event.preventDefault();
     setInstallPrompt(event as any);
   };

   const handleAppInstalled = () => {
     setIsStandalone(true);
     setInstallPrompt(null);
   };

   window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
   window.addEventListener('appinstalled', handleAppInstalled);

   return () => {
     window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
     window.removeEventListener('appinstalled', handleAppInstalled);
   };
  }, []);

  const handleInstallClick = async () => {
   if (installPrompt) {
     installPrompt.prompt();

     const choiceResult = await installPrompt.userChoice;
     if (choiceResult.outcome === 'accepted') {
       console.log('User accepted the install prompt');
     } else {
       console.log('User dismissed the install prompt');
     }
     setInstallPrompt(null);
     return;
   }
  };

  const handleDismissClick = () => {
   const expiry = Date.now() + DISMISS_DURATION_MS;
   window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(expiry));
   setIsDismissed(true);
  };

  const userAgent = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const isDesktop = !isIOS && !isAndroid && !/Mobile/i.test(userAgent);

  const getInstallGuide = () => {
   if (isIOS) {
     return 'Tap the Share button, then choose “Add to Home Screen”.';
   }

   if (isAndroid) {
     return 'Tap the menu icon, then choose “Install app” or “Add to Home screen”.';
   }

   if (isDesktop) {
     return 'Use the install icon in the address bar or browser menu to install this app.';
   }

   return 'Use your browser menu to install this app for a faster, app-like experience.';
  };

  const shouldRender = !isStandalone && !isDismissed;

  if (!shouldRender) {
   return null;
  }

  return (
   <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500">
     <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-blue-500/30 rounded-2xl shadow-2xl w-full max-w-sm p-4 text-white">
       <div className="flex items-start gap-4">
         <div className="bg-blue-600/20 border border-blue-500/30 p-2 rounded-xl text-blue-400">
           {isIOS ? <Share className="w-6 h-6" /> : isAndroid ? <Smartphone className="w-6 h-6" /> : <MonitorSmartphone className="w-6 h-6" />}
         </div>
         <div className="flex-1">
           <h3 className="font-bold text-sm text-white">Ku Rakibo App-ka</h3>
           <p className="text-xs text-slate-300 mt-1 leading-relaxed">
             {getInstallGuide()}
           </p>
           {installPrompt ? (
             <button
               onClick={handleInstallClick}
               className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2 px-4 rounded-lg transition-all active:scale-95"
             >
               Hadda Rakib
             </button>
           ) : (
             <button
               onClick={() => alert(getInstallGuide())}
               className="mt-3 w-full bg-slate-700/70 text-slate-200 font-medium text-xs py-2 px-4 rounded-lg border border-slate-600 text-center"
             >
               Raac tilmaamaha
             </button>
           )}
         </div>
         <button onClick={handleDismissClick} className="p-1 hover:bg-white/10 rounded-full" aria-label="Dismiss install prompt">
           <X className="w-4 h-4 text-slate-400" />
         </button>
       </div>
     </div>
   </div>
  );
};

export default InstallPwaPrompt;
