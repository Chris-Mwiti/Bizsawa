import { Platform } from 'react-native';

/**
 * Registers the PWA service worker on web.
 *
 * The SW lives at the site root so its scope covers every route (expo-router
 * serves the SPA from index.html). Registration is deferred until after
 * `load` so it never competes with the first paint, and it is skipped in
 * dev where the SW would fight the Metro dev server.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Dev builds are served by Metro with no-cache headers; a SW would serve
  // stale bundles and confuse hot reload.
  if (__DEV__) return;

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('[PWA] service worker registration failed', error);
    });
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

/**
 * Asks a waiting service worker to take over. Used by the in-app update
 * prompt so a new build applies without a hard reload.
 */
export function activateWaitingServiceWorker(): void {
  if (Platform.OS !== 'web') return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.getRegistration().then((registration) => {
    if (registration?.waiting) {
      registration.waiting.postMessage('SKIP_WAITING');
    }
  });
}
