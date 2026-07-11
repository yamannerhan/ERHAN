/* ÖzelGüvenlik PWA Service Worker — Web Push + custom sounds */
const CACHE_NAME = "ozelguvenlik-push-v4";
const NOTIF_ICON = "/notification-icon.png";
const NOTIF_BADGE = "/notification-badge.png";

self.addEventListener("install", () => self.skipWaiting());

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
    kind: "campaign",
    soundUrl: null,
    icon: null,
    badge: null,
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try { data.body = event.data ? event.data.text() : data.body; } catch { /* ignore */ }
  }

  const origin = self.location.origin;
  const iconPath = data.icon || NOTIF_ICON;
  const badgePath = data.badge || NOTIF_BADGE;
  const icon = iconPath.startsWith("http") ? iconPath : `${origin}${iconPath}`;
  const badge = badgePath.startsWith("http") ? badgePath : `${origin}${badgePath}`;

  const options = {
    body: data.body,
    icon,
    badge,
    tag: data.tag || "og-push",
    renotify: true,
    requireInteraction: false,
    silent: data.sound === false,
    vibrate: data.sound === false ? undefined : [120, 60, 120],
    data: { url: data.url || "/", soundUrl: data.soundUrl || null, kind: data.kind || "campaign" },
    actions: [{ action: "open", title: "Aç" }],
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || "Özel Güvenlik", options);
    if (data.sound === false) return;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      c.postMessage({ type: "OG_PUSH_SOUND", soundUrl: data.soundUrl || null, kind: data.kind || "campaign" });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = raw.startsWith("http") ? raw : new URL(raw, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(target).then(() => client.focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
