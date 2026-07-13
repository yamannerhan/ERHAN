export type NotifPrefs = {
  notifListings: boolean;
  notifJoin: boolean;
  notifSite: boolean;
  notifOther: boolean;
  notifSound: boolean;
  notifChatSound: boolean;
  notifOnlyBackground: boolean;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  notifListings: true,
  notifJoin: true,
  notifSite: true,
  notifOther: true,
  notifSound: true,
  notifChatSound: true,
  notifOnlyBackground: true,
};

export const NOTIF_PREF_ITEMS: Array<{ key: keyof NotifPrefs; label: string; desc: string }> = [
  { key: "notifListings", label: "İş ilanı bildirimleri", desc: "Yeni üye ilanı paylaşılınca" },
  { key: "notifJoin", label: "Yeni üye kayıt bildirimleri", desc: "Yeni kayıt olunca" },
  { key: "notifSite", label: "Site bildirimleri", desc: "Kampanya, özet, hoşgeldin" },
  { key: "notifOther", label: "Sohbet / yanıt bildirimleri", desc: "Sohbete yazılınca, yanıtlanınca…" },
  { key: "notifChatSound", label: "Sohbet sesi", desc: "Gerçek kullanıcı mesajında bip" },
  { key: "notifSound", label: "Bildirim sesi", desc: "Push / zil sesi" },
  { key: "notifOnlyBackground", label: "Sadece arka planda bildir", desc: "Uygulama açıkken push/ses gitmez" },
];

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function mirrorPrefsLocal(prefs: NotifPrefs): void {
  try {
    localStorage.setItem("notif_prefs", JSON.stringify(prefs));
    localStorage.setItem("og_notif_sound", prefs.notifSound === false ? "0" : "1");
    localStorage.setItem("og_chat_sound", prefs.notifChatSound === false ? "0" : "1");
    localStorage.setItem("og_notif_bg_only", prefs.notifOnlyBackground === false ? "0" : "1");
  } catch { /* ignore */ }
}

export async function fetchNotifPrefs(): Promise<NotifPrefs> {
  const res = await fetch("/api/push/prefs", { headers: authHeaders(), cache: "no-store" });
  if (!res.ok) return { ...DEFAULT_NOTIF_PREFS };
  const data = await res.json() as Partial<NotifPrefs>;
  const prefs: NotifPrefs = {
    notifListings: data.notifListings !== false,
    notifJoin: data.notifJoin !== false,
    notifSite: data.notifSite !== false,
    notifOther: data.notifOther !== false,
    notifSound: data.notifSound !== false,
    notifChatSound: data.notifChatSound !== false,
    notifOnlyBackground: data.notifOnlyBackground !== false,
  };
  mirrorPrefsLocal(prefs);
  return prefs;
}

export async function saveNotifPrefsApi(prefs: NotifPrefs): Promise<NotifPrefs> {
  const res = await fetch("/api/push/prefs", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("save failed");
  const saved = await res.json() as NotifPrefs;
  const normalized: NotifPrefs = {
    notifListings: saved.notifListings !== false,
    notifJoin: saved.notifJoin !== false,
    notifSite: saved.notifSite !== false,
    notifOther: saved.notifOther !== false,
    notifSound: saved.notifSound !== false,
    notifChatSound: saved.notifChatSound !== false,
    notifOnlyBackground: saved.notifOnlyBackground !== false,
  };
  mirrorPrefsLocal(normalized);
  return normalized;
}

export function isChatSoundEnabled(): boolean {
  try {
    return localStorage.getItem("og_chat_sound") !== "0";
  } catch {
    return true;
  }
}

export function isNotifSoundEnabled(): boolean {
  try {
    return localStorage.getItem("og_notif_sound") !== "0";
  } catch {
    return true;
  }
}

export function isBackgroundOnlyEnabled(): boolean {
  try {
    return localStorage.getItem("og_notif_bg_only") !== "0";
  } catch {
    return true;
  }
}

/** Uygulama sekmesi görünür mü? */
export function isAppForeground(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export function playChatMessageSound(): void {
  if (!isChatSoundEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 660;
    g.gain.value = 0.07;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    o.stop(ctx.currentTime + 0.3);
  } catch { /* ignore */ }
}
