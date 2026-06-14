/**
 * Registers the service worker in production.
 * In development Vite serves files without hashing, so we skip registration
 * to avoid stale-cache headaches during dev.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Check for updates every 60 minutes when the tab is visible
        setInterval(() => {
          if (!document.hidden) reg.update();
        }, 60 * 60 * 1000);
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
  });
}
