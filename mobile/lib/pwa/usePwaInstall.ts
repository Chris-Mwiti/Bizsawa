import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type PwaInstallState =
  /** The browser supports install but hasn't offered the prompt yet. */
  | 'available'
  /** The prompt is ready and can be shown on demand. */
  | 'ready'
  /** The app is already running as an installed PWA. */
  | 'installed'
  /** iOS Safari — no programmatic prompt; the user must use Share → Add to Home Screen. */
  | 'ios-manual'
  /** Browser/OS can't install this app. */
  | 'unsupported';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac — touch points give it away.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/**
 * Drives the PWA install prompt.
 *
 * Chrome/Android fires `beforeinstallprompt`, which we capture so the install
 * button can trigger it from a user gesture (calling `prompt()` outside a
 * gesture is blocked). iOS Safari has no such event — there the user adds the
 * app manually via Share → Add to Home Screen, so we surface instructions
 * instead of a dead button.
 */
export function usePwaInstall() {
  const [state, setState] = useState<PwaInstallState>('unsupported');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    if (isStandalone()) {
      setState('installed');
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless we preventDefault.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setState('ready');
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setState('installed');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // If the browser supports the API but hasn't fired yet, we're still
    // installable — the prompt arrives once the PWA criteria are met.
    if ('onbeforeinstallprompt' in window) {
      setState((current) => (current === 'installed' ? current : 'available'));
    } else if (isIos()) {
      setState('ios-manual');
    } else {
      setState('unsupported');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (outcome === 'accepted') {
        setState('installed');
        return true;
      }

      // Dismissed — the browser may offer the prompt again later.
      setState('available');
      return false;
    } catch (error) {
      console.warn('[PWA] install prompt failed', error);
      return false;
    }
  }, [deferredPrompt]);

  return {
    state,
    canInstall: state === 'ready' || state === 'available',
    isInstalled: state === 'installed',
    needsManualSteps: state === 'ios-manual',
    install,
  };
}
