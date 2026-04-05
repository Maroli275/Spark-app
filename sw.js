// ⚡ Spark Service Worker
// Handles: offline caching, background sync, push notifications

const CACHE_NAME = 'spark-v1';
const OFFLINE_URL = '/';

// Files to cache for offline use
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,600&family=Instrument+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL: cache essential files ──────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE.map(url => cache.add(url).catch(() => {})) // silently skip failures
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ───────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fall back to network ───────────────────
self.addEventListener('fetch', event => {
  // Skip non-GET and cross-origin API requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/') || event.request.url.includes('anthropic.com')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ───────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {
    title: '⚡ Your Spark is waiting!',
    body: 'Time for today\'s 5-minute challenge 🔥',
    icon: '/icon.png',
    badge: '/badge.png',
    tag: 'daily-spark',
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon.svg',
      badge: data.badge || '/icon.svg',
      tag: data.tag || 'spark-notif',
      renotify: true,
      requireInteraction: false,
      vibrate: [100, 50, 100],
      data: data.data || { url: '/' },
      actions: [
        { action: 'open', title: '⚡ Start Spark' },
        { action: 'dismiss', title: 'Later' }
      ]
    })
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── BACKGROUND SYNC (streak protection) ─────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-completions') {
    event.waitUntil(syncPendingCompletions());
  }
});

async function syncPendingCompletions() {
  // In production: pull from IndexedDB and POST to /api/challenges/complete
  console.log('[Spark SW] Syncing pending completions...');
}

// ── PERIODIC BACKGROUND SYNC (daily reminder) ───────────────────────
self.addEventListener('periodicsync', event => {
  if (event.tag === 'daily-spark-reminder') {
    event.waitUntil(checkAndNotify());
  }
});

async function checkAndNotify() {
  const today = new Date().toDateString();
  // In production: check if user has already sparked today via IndexedDB
  // If not, show a reminder notification
  self.registration.showNotification('⚡ Don\'t break your streak!', {
    body: 'Your daily Spark is waiting — takes just 5 minutes 🔥',
    tag: 'streak-reminder',
    data: { url: '/' }
  });
}
