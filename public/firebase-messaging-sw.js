/* eslint-disable no-undef */
// Firebase Cloud Messaging Background Service Worker for PISET Cooperative Society Port Harcourt

self.addEventListener('push', (event) => {
  let payload = {
    title: 'PISET Cooperative Society Port Harcourt',
    body: 'New cooperative update available.',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      const notification = parsed.notification || parsed;
      payload = {
        title: notification.title || payload.title,
        body: notification.body || payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: parsed.data || { url: '/' },
      };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      data: payload.data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
      return null;
    })
  );
});
