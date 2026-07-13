/* ÖzelGüvenlik PWA Service Worker — Web Push + custom sounds */
const CACHE_NAME = "ozelguvenlik-push-v6";
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

function isYoutubeSound(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  return u.includes("youtube.com") || u.includes("youtu.be") || u.includes("music.youtube");
}

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
    force: false,
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
  const soundUrl = isYoutubeSound(data.soundUrl) ? null : data.soundUrl;

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const anyVisible = clients.some((c) => {
      try {
        return c.visibilityState === "visible";
      } catch {
        return false;
      }
    });

    // Kampanya / force: uygulama açıkken de OS bildirimi göster
    // Diğer türler: sadece arka planda göster
    const forceShow = data.force === true || data.kind === "campaign" || data.kind === "digest";
    if (anyVisible && !forceShow) {
      for (const c of clients) {
        c.postMessage({ type: "OG_PUSH_SILENT", kind: data.kind || "campaign", title: data.title, body: data.body });
      }
      return;
    }

    const options = {
      body: data.body,
      icon,
      badge,
      tag: data.tag || "og-push",
      renotify: true,
      requireInteraction: false,
      silent: data.sound === false,
      vibrate: data.sound === false ? undefined : [120, 60, 120],
      data: { url: data.url || "/", soundUrl: soundUrl || null, kind: data.kind || "campaign", force: !!forceShow },
      actions: [{ action: "open", title: "Aç" }],
    };

    await self.registration.showNotification(data.title || "Özel Güvenlik", options);

    // Özel ses: YouTube yok. Kampanya/force ise uygulama açıkken de çal (admin test).
    const playSound = data.sound !== false && soundUrl && (!anyVisible || forceShow);
    if (!playSound) {
      // Sistem bip: arka planda veya force kampanyada (URL yoksa)
      if (data.sound !== false && (!anyVisible || forceShow)) {
        for (const c of clients) {
          c.postMessage({ type: "OG_PUSH_SOUND", soundUrl: null, kind: data.kind || "campaign" });
        }
      }
      return;
    }
    for (const c of clients) {
      c.postMessage({ type: "OG_PUSH_SOUND", soundUrl: soundUrl || null, kind: data.kind || "campaign" });
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
