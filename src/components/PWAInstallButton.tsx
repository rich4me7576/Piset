import React, { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await install();
          } else {
            setShowGuideModal(true);
          }
        }}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-800/20 bg-emerald-950/5 px-2.5 sm:px-3.5 py-2 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-950/10 whitespace-nowrap shrink-0"
        aria-label="Install PISET Cooperative App"
      >
        <Download className="h-4 w-4 text-emerald-800" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="pwa-install-title"
                  className="text-lg font-bold text-slate-900"
                >
                  Install PISET Cooperative PWA
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Access your savings card, contribution grid, and loan
                  schedules offline right from your home screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close install instructions"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {isIOS ? (
                <>
                  <p>
                    1. Tap the <strong>Share</strong> icon in your Safari
                    toolbar.
                  </p>
                  <p>
                    2. Scroll down and select{' '}
                    <strong>Add to Home Screen</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    1. Click the <strong>Install</strong> icon in your browser
                    address bar (or open the browser menu).
                  </p>
                  <p>
                    2. Select <strong>Install PISET Cooperative Society</strong>{' '}
                    to launch as a standalone app.
                  </p>
                </>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[44px] rounded-xl bg-emerald-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineBanner: React.FC<{ simulatedOffline?: boolean }> = ({
  simulatedOffline = false,
}) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !simulatedOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-900 text-amber-50 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        Offline Mode Active — Viewing cached cooperative records. Changes will
        sync when reconnected.
      </span>
    </div>
  );
};
