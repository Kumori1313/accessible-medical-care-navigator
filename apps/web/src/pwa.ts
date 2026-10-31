import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";

export interface PwaState {
  online: boolean;
  /** A new version has been downloaded and is waiting for the user to accept it. */
  updateReady: boolean;
  offlineReady: boolean;
  applyUpdate: () => void;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

/** Registers the service worker (production builds only) and exposes update/offline state. */
export function usePwa(): PwaState {
  const online = useOnline();
  const [updateReady, setUpdateReady] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const update = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const updateSW = registerSW({
      onNeedRefresh: () => setUpdateReady(true),
      onOfflineReady: () => setOfflineReady(true),
    });
    update.current = () => updateSW(true);
  }, []);

  return {
    online,
    updateReady,
    offlineReady,
    applyUpdate: () => void update.current?.(),
  };
}
