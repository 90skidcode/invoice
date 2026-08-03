import { Button } from '@/components/ui/button';
import { Download, Share, X } from 'lucide-react';
import * as React from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

const DISMISS_KEY = 'counter_install_prompt_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 14;

function isStandalone(): boolean {
  const nav = window.navigator as unknown as { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function wasRecentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
  return daysSince < DISMISS_COOLDOWN_DAYS;
}

/**
 * Nudges the user to install the PWA. Android/Chromium fires
 * beforeinstallprompt, which we capture and trigger from our own button —
 * iOS Safari never fires it (no install API exists there), so we show
 * manual Share → Add to Home Screen instructions instead.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = React.useState<'android' | 'ios' | null>(null);

  React.useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIos()) {
      setPlatform('ios');
      return;
    }

    function onBeforeInstallPrompt(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform('android');
    }
    function onInstalled() {
      setPlatform(null);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setPlatform(null);
    setDeferredPrompt(null);
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === 'accepted') setPlatform(null);
  }

  if (!platform) return null;

  return (
    <div className="mb-3 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
      {platform === 'ios' ? (
        <>
          <Share className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">
            Install Counter: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </span>
        </>
      ) : (
        <>
          <Download className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex-1">Install Counter for faster access, even offline.</span>
          <Button size="sm" variant="primary" onClick={handleInstallClick}>
            Install
          </Button>
        </>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
