/** Web Push aboneliği — PWA / Chrome / Android */
const LS_ASKED = "og_push_asked_v1";
const LS_DENIED = "og_push_denied_v1";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = localStorage.getItem("auth_token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await registerPushServiceWorker();
  if (!reg) return false;

  const perm = await Notification.requestPermission();
  localStorage.setItem(LS_ASKED, "1");
  if (perm !== "granted") {
    localStorage.setItem(LS_DENIED, "1");
    return false;
  }
  localStorage.removeItem(LS_DENIED);

  const keyRes = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
  if (!keyRes.ok) return false;
  const { publicKey } = await keyRes.json() as { publicKey?: string };
  if (!publicKey) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: await getAuthHeaders(),
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    }),
  });
  return res.ok;
}

export function shouldShowPushPrompt(): boolean {
  if (!pushSupported()) return false;
  if (Notification.permission === "granted") return false;
  if (Notification.permission === "denied") return false;
  if (localStorage.getItem(LS_ASKED) === "1") return false;
  return true;
}

export async function ensurePushSubscriptionQuiet(): Promise<void> {
  if (!pushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const reg = await registerPushServiceWorker();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) {
      await subscribeToPush();
      return;
    }
    const json = sub.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      }),
    });
  } catch {
    // ignore
  }
}

/** İzin verildiğinde kısa bip (sayfa açıkken) */
export function playNotificationBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore
  }
}

/** Adminin verdiği özel ses URL'si (yoksa bip) */
export function playPushSound(soundUrl?: string | null): void {
  try {
    if (localStorage.getItem("og_notif_sound") === "0") return;
  } catch { /* ignore */ }
  // YouTube asla çalmaz
  if (soundUrl && /youtube\.com|youtu\.be|music\.youtube/i.test(soundUrl)) {
    playNotificationBeep();
    return;
  }
  if (soundUrl) {
    try {
      const audio = new Audio(soundUrl.startsWith("http") || soundUrl.startsWith("/") ? soundUrl : soundUrl);
      audio.volume = 0.85;
      void audio.play().catch(() => playNotificationBeep());
      return;
    } catch {
      // fall through
    }
  }
  playNotificationBeep();
}

/** SW'den gelen özel ses mesajını dinle */
export function listenForPushSounds(): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; soundUrl?: string | null } | null;
    if (data?.type === "OG_PUSH_SOUND") playPushSound(data.soundUrl);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
