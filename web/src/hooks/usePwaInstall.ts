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

/**
 * Drives the PWA install prompt on the marketing site.
 *
 * Chrome/Android fires `beforeinstallprompt`; we hold onto it so the install
 * button can trigger the dialog from a real user gesture (browsers block
 * `prompt()` outside one). iOS Safari never fires it — there the user adds
 * the app by hand, so we show instructions rather than a dead button.
 */
export function usePwaInstall() {
  const [state, setState] = useState<PwaInstallState>("unsupported");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandalone()) {
      setState("installed");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chrome's mini-infobar — we render our own button.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setState("ready");
    };

    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    if ("onbeforeinstallprompt" in window) {
      setState((current) => (current === "installed" ? current : "available"));
    } else if (isIos()) {
      setState("ios-manual");
    } else {
      setState("unsupported");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);

      if (outcome === "accepted") {
        setState("installed");
        return true;
      }

      // Dismissed — the browser may offer it again later.
      setState("available");
      return false;
    } catch (error) {
      console.warn("[PWA] install prompt failed", error);
      return false;
    }
  }, [deferredPrompt]);

  return {
    state,
    canInstall: state === "ready" || state === "available",
    isInstalled: state === "installed",
    needsManualSteps: state === "ios-manual",
    install,
  };
}
