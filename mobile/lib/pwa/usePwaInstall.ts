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

function isBrowser(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  );
}

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

// Capture `beforeinstallprompt` as soon as this module loads. The banner lives
// behind auth/font providers, so by the time it mounts the browser may already
// have fired the event — and a missed event can never be replayed.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let didInstall = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((subscriber) => subscriber());
}

function currentState(): PwaInstallState {
  if (!isBrowser()) return 'unsupported';
  if (isStandalone() || didInstall) return 'installed';
  if (deferredPrompt) return 'ready';
  if ('onbeforeinstallprompt' in window) return 'available';
  if (isIos()) return 'ios-manual';
  return 'unsupported';
}

if (isBrowser()) {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Chrome shows its own mini-infobar unless we preventDefault.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    didInstall = true;
    notify();
  });
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
  const [state, setState] = useState<PwaInstallState>(currentState);

  useEffect(() => {
    if (!isBrowser()) return;

    const update = () => setState(currentState());
    // Re-read after mount in case the event fired before we subscribed.
    update();
    subscribers.add(update);

    return () => {
      subscribers.delete(update);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    // Only a captured event can be prompted; there is nothing to call before
    // the browser fires `beforeinstallprompt`.
    const promptEvent = deferredPrompt;
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;

      // One prompt call per event — drop it even if the user dismissed.
      if (deferredPrompt === promptEvent) {
        deferredPrompt = null;
      }

      if (outcome === 'accepted') {
        didInstall = true;
        notify();
        return true;
      }

      // Dismissed — the browser may offer the prompt again later.
      notify();
      return false;
    } catch (error) {
      console.warn('[PWA] install prompt failed', error);
      return false;
    }
  }, []);

  return {
    state,
    // A button is only useful once the native prompt has been captured.
    canInstall: state === 'ready',
    isInstalled: state === 'installed',
    needsManualSteps: state === 'ios-manual',
    install,
  };
}
