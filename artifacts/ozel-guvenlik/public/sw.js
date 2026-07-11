/* ÖzelGüvenlik PWA Service Worker — Web Push + cache bust */
const CACHE_NAME = "ozelguvenlik-push-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = {
    title: "Özel Güvenlik",
    body: "Yeni bildirim",
    url: "/",
    tag: "og-push",
    sound: true,
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      data.body = event.data ? event.data.text() : data.body;
    } catch { /* ignore */ }
  }

  const options = {
    body: data.body,
    icon: "/favicon-192x192.png",
    badge: "/favicon-32x32.png",
    tag: data.tag || "og-push",
    renotify: true,
    requireInteraction: false,
    silent: data.sound === false,
    vibrate: data.sound === false ? undefined : [120, 60, 120],
    data: { url: data.url || "/" },
    actions: [{ action: "open", title: "Aç" }],
  };

  event.waitUntil(self.registration.showNotification(data.title || "Özel Güvenlik", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = raw.startsWith("http") ? raw : new URL(raw, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
