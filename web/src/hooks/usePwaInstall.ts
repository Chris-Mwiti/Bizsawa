import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallState =
  /** Installable, prompt not yet captured (browser fires it when criteria are met). */
  | "available"
  /** Prompt captured — a click can trigger the native install dialog. */
  | "ready"
  /** Already running as an installed app. */
  | "installed"
  /** iOS Safari — the user must add it manually via Share → Add to Home Screen. */
  | "ios-manual"
  /** This browser can't install the app. */
  | "unsupported";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.addEventListener === "function";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true || iosStandalone;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac — touch points give it away.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

// Capture `beforeinstallprompt` as soon as the module loads. It can fire before
// React mounts, and a missed event can never be replayed — which left the
// install button visible but silently doing nothing.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let didInstall = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((subscriber) => subscriber());
}

function currentState(): PwaInstallState {
  if (!isBrowser()) return "unsupported";
  if (isStandalone() || didInstall) return "installed";
  if (deferredPrompt) return "ready";
  if ("onbeforeinstallprompt" in window) return "available";
  if (isIos()) return "ios-manual";
  return "unsupported";
}

if (isBrowser()) {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's mini-infobar — we render our own button.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    didInstall = true;
    notify();
  });
}

/**
 * Drives the PWA install prompt on the marketing site.
 *
 * Chrome/Android fires `beforeinstallprompt`; we hold onto it so the install
 * button can trigger the dialog from a real user gesture (browsers block
 * `prompt()` outside one). iOS Safari never fires it — there the user adds
 * the app by hand, so we show instructions rather than a dead button.
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

      if (outcome === "accepted") {
        didInstall = true;
        notify();
        return true;
      }

      // Dismissed — the browser may offer the prompt again later.
      notify();
      return false;
    } catch (error) {
      console.warn("[PWA] install prompt failed", error);
      return false;
    }
  }, []);

  return {
    state,
    // A button is only useful once the native prompt has been captured.
    canInstall: state === "ready",
    isInstalled: state === "installed",
    needsManualSteps: state === "ios-manual",
    install,
  };
}
