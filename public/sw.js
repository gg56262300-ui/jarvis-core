self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', () => {
  // no offline cache for now
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      payload = { title: 'Jarvis', body: event.data?.text?.() || '' };
    }

    const title = payload.title || 'Jarvis';
    const body = payload.body || 'Jarvis ootab kinnitust.';
    const url = payload.url || '/chat.html';

    await self.registration.showNotification(title, {
      body,
      tag: 'jarvis-pending',
      renotify: true,
      silent: false,
      requireInteraction: true,
      data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = event.notification?.data?.url || '/chat.html';
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsArr) {
      if (client.url.includes(url)) {
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
