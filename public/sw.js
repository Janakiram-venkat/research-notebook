// Service worker: lets the app open offline.
//
//  - Pages (navigations): network first, falling back to the cached app shell.
//  - Built assets and the Pyodide runtime: cache first (their URLs are versioned / hashed).
//  - /api is never cached: notes sync is handled by the app itself.

const VERSION = 'nb-v2'
const SHELL = 'nb-shell-' + VERSION
const ASSETS = 'nb-assets-' + VERSION
const RUNTIME = 'nb-runtime-' + VERSION // Pyodide and other CDN files

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg', '/theme-init.js'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, ASSETS, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api')) return
    if (request.mode === 'navigate') {
      event.respondWith(
        fetch(request)
          .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return res })
          .catch(() => caches.match('/')),
      )
      return
    }
    if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(ASSETS, request))
    else if (url.pathname === '/theme-init.js') event.respondWith(fetch(request).catch(() => caches.match(request)))
    return
  }

  if (url.hostname === 'cdn.jsdelivr.net') event.respondWith(cacheFirst(RUNTIME, request))
})
