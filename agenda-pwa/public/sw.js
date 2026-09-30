// Service Worker: recebe os pushes, mostra a notificação (o iOS a espelha no Apple Watch)
// e trata os botões Concluir / Adiar quando o sistema os exibe.
const CACHE = 'agenda-v1';
const SHELL = ['/', '/app.js', '/recur.js', '/styles.css', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Shell do app: rede primeiro (sempre atualizado), cache se estiver offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Agenda', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Agenda', {
      body: d.body || '',
      tag: d.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: d,
      renotify: true,
      actions: d.eventId ? [{ action: 'done', title: 'Concluir' }, { action: 'snooze', title: 'Adiar 10 min' }] : [],
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  n.close();
  if (e.action === 'done' || e.action === 'snooze') {
    e.waitUntil(
      getUid().then((id) =>
        id && fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: id, eventId: n.data.eventId, action: e.action }),
        })
      )
    );
    return;
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/');
    })
  );
});

// O uid é guardado pelo app no Cache Storage (o SW não enxerga localStorage).
async function getUid() {
  const c = await caches.open('agenda-meta');
  const r = await c.match('/__uid');
  return r ? r.text() : null;
}
