// Workout Nudge service worker: offline cache + best-effort background reminders.
const CACHE = 'wn-app-v2';
const ASSETS = ['./', 'index.html', 'manifest.json', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => k !== CACHE && k !== 'wn-state').map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
// Network first so updates show up; fall back to cache offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

const dkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

async function checkReminder() {
  const c = await caches.open('wn-state');
  const res = await c.match('state.json');
  if (!res) return;
  const s = await res.json();
  const now = new Date(), today = dkey(now);
  const [hh, mm] = (s.time || '07:00').split(':').map(Number);
  const due = new Date(); due.setHours(hh, mm, 0, 0); due.setMinutes(due.getMinutes() - (s.lead || 0));
  if (!s.days.includes(now.getDay()) || now < due) return;
  if (s.notified === today || (s.doneDates || []).includes(today)) return;
  s.notified = today;
  await c.put('state.json', new Response(JSON.stringify(s)));
  await self.registration.showNotification('💪 Workout time', {
    body: "It's a workout day. 30 minutes — tap to start.",
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'workout', vibrate: [200, 100, 200]
  });
}
self.addEventListener('periodicsync', e => {
  if (e.tag === 'workout-reminder') e.waitUntil(checkReminder());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const w of list) if ('focus' in w) return w.focus();
    return self.clients.openWindow('./');
  }));
});
