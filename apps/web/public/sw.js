/**
 * Counter PWA Service Worker
 *
 * Strategies:
 *   /v1/*          → network-only   (live data, never cache)
 *   /uploads/*     → cache-first    (image files, immutable by UUID)
 *   /assets/*      → stale-while-revalidate (Vite-hashed JS/CSS bundles)
 *   navigation     → network-first, fallback to cached shell (SPA offline)
 *   everything else→ network-first
 *
 * Bump CACHE_VERSION on every production deploy to force a clean install.
 */

'use strict';

const CACHE_VERSION = 'counter-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const IMAGE_CACHE   = `${CACHE_VERSION}-images`;
const ALL_CACHES    = [STATIC_CACHE, IMAGE_CACHE];

// ── Install ───────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // Pre-cache just the shell entry-point; assets are cached on first visit.
      .then((cache) => cache.addAll(['/', '/manifest.json', '/icon.svg']))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !ALL_CACHES.includes(k))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET from our own origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API calls — always live; never cache
  if (url.pathname.startsWith('/v1/')) return;

  // Uploaded images — cache-first (UUID filenames are effectively immutable)
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
        }),
      ),
    );
    return;
  }

  // Vite asset bundles (/assets/…) — stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
          // Return cached immediately if available; update cache in background
          return cached ?? networkFetch;
        }),
      ),
    );
    return;
  }

  // SPA navigation — network-first, fallback to cached shell so the app
  // opens offline and React Router handles the URL client-side
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Cache the fresh shell on every successful navigation
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put('/', clone));
          }
          return res;
        })
        .catch(() =>
          caches
            .match('/')
            .then((cached) => cached ?? new Response('Counter is offline', { status: 503 })),
        ),
    );
    return;
  }

  // Default — network-first, cache on success
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
