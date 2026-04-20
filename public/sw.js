/* Paaritatud chat.html bustStaleChatLayout rev-iga (footer-v28+): install kustutab cache’i; HTML bump käivitab unregister+reload. */
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
    const nowTag = `jarvis-msg-${Date.now()}`;

    await self.registration.showNotification(title, {
      body,
      tag: nowTag,
      renotify: true,
      silent: false,
      requireInteraction: true,
      badge: '/icons/icon-192.png',
      icon: '/icons/icon-192.png',
      data: { url },
    });

    try {
      const openNotifications = await self.registration.getNotifications();
      const unreadCount = openNotifications.length;
      if (self.navigator && 'setAppBadge' in self.navigator) {
        await self.navigator.setAppBadge(unreadCount);
      }
    } catch {
      // ignore badge API failures
    }
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
        try {
          const remaining = await self.registration.getNotifications();
          if (self.navigator && 'setAppBadge' in self.navigator) {
            if (remaining.length > 0) await self.navigator.setAppBadge(remaining.length);
            else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
          }
        } catch {
          // ignore badge API failures
        }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

self.addEventListener('notificationclose', (event) => {
  event.waitUntil((async () => {
    try {
      const remaining = await self.registration.getNotifications();
      if (self.navigator && 'setAppBadge' in self.navigator) {
        if (remaining.length > 0) await self.navigator.setAppBadge(remaining.length);
        else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
      }
    } catch {
      // ignore badge API failures
    }
  })());
});
