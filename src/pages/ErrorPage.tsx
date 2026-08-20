import { useEffect, useState } from "react";
import { useRouteError } from "react-router-dom";
import { userErrorMessage } from "../utils/userError";

export default function ErrorPage() {
  const error: any = useRouteError();
  const [recovering, setRecovering] = useState(false);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  console.error(error);

  const recover = async () => {
    if (recovering) return;
    setRecovering(true);
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.update().catch(() => undefined)));
      }
    } finally {
      window.location.reload();
    }
  };

  useEffect(() => {
    const raw = String(error?.message || error || '');
    if (!/failed to fetch dynamically imported module|loading chunk|importing a module script|load failed/i.test(raw)) return;
    const recoveryKey = `ludosom_route_recovery:${window.location.pathname}`;
    if (sessionStorage.getItem(recoveryKey) === '1') return;
    sessionStorage.setItem(recoveryKey, '1');
    void recover();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2e1065] via-[#0f052d] to-[#020012] text-white flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-4xl font-bold">{offline ? 'Internet ma jiro' : 'Oops!'}</h1>
        <p className="mt-4">{offline ? 'Mobile Data ama Wi-Fi ayaa dansan ama xiriirku wuu go\'ay.' : 'Sorry, an unexpected error has occurred.'}</p>
        <p className="mt-2">
          <i>{offline ? 'Fadlan shid internetka, kadibna isku day mar kale.' : userErrorMessage(error, 'This page could not be opened.')}</i>
        </p>
        <button
          type="button"
          onClick={() => void recover()}
          disabled={recovering}
          className="mt-6 rounded-xl bg-purple-600 px-5 py-3 font-bold text-white disabled:opacity-60"
        >
          {recovering ? 'Checking…' : offline ? 'Isku day mar kale' : 'Retry and update app'}
        </button>
      </div>
    </div>
  );
}
