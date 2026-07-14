/** Sohbet: son 200 mesajı yenilemede kaybetmeme yardımcıları */

export type ChatExtMsg = {
  id: number;
  userId: number;
  content: string;
  username: string;
  createdAt?: string;
  isBot?: boolean;
  isFake?: boolean;
  userRole?: string | null;
  [key: string]: unknown;
};

const HUMANS_CACHE_KEY = "og_chat_humans_v2";
const CHAT_CACHE_LIMIT = 200;

export function isDbMessageId(id: number): boolean {
  return Number.isFinite(id) && id > 0 && id < 1_000_000_000;
}

export function isRealHuman(msg: { userId: number; isBot?: boolean; isFake?: boolean; userRole?: string | null }): boolean {
  if (msg.isBot || msg.isFake) return false;
  if (msg.userId <= 0) return false;
  if (msg.userRole === "bot") return false;
  return true;
}

export function isJoinAnnounce(msg: { content?: string }): boolean {
  // Yalnızca yeni kayıt duyurusu (sohbet join değil)
  return /aramıza katıldı/i.test(msg.content ?? "");
}

/** Sohbete giriş (socket) duyurusu — kayıt değil */
export function isChatJoinNotice(text: string): boolean {
  return /sohbete\s+katıldı/i.test(text);
}

/** İlan duyurusu (bot veya üye) */
export function isListingAnnounce(text: string): boolean {
  return /yeni\s+ilan|ilan\s+paylaştı|\/ilan\/\d+/i.test(text);
}

export function extractJoinUsername(text: string): string | null {
  // "🎉 **Ali** @ali_user aramıza katıldı!" | "ali sohbete katıldı"
  const at = text.match(/@(\w+)/);
  if (at?.[1]) return at[1];
  const m = text.match(/^@?(\w+)\s+(?:sohbete\s+katıldı|aramıza\s+katıldı)/i)
    || text.match(/(\w+)\s+aramıza\s+katıldı/i)
    || text.match(/^(.+?)\s+sohbete\s+katıldı/i);
  return m?.[1]?.replace(/\*\*/g, "").trim() ?? null;
}

/** Her senkron: incremental + her zaman son 200 mesaj (üye + sistem + ilan) */
export async function fetchChatSyncPayload(opts: {
  after: number;
  headers: HeadersInit;
}): Promise<ChatExtMsg[]> {
  const fetchJson = async (url: string) => {
    const res = await fetch(url, { headers: opts.headers, cache: "no-store" });
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? (data as ChatExtMsg[]) : [];
  };

  const after = opts.after > 0 && isDbMessageId(opts.after) ? opts.after : 0;
  const [mixedOrInc, humans] = await Promise.all([
    after > 0
      ? fetchJson(`/api/chat/messages?limit=200&after=${after}`)
      : fetchJson("/api/chat/messages?limit=200"),
    // Üye mesajlarının atlanmaması için ayrı çekim
    fetchJson("/api/chat/messages?limit=200&humansOnly=1"),
  ]);

  const byId = new Map<number, ChatExtMsg>();
  for (const m of [...mixedOrInc, ...humans]) {
    if (isDbMessageId(m.id)) byId.set(m.id, m);
  }
  const ordered = [...byId.values()].sort((a, b) => a.id - b.id);
  const lastJoinByText = new Map<string, number>();
  return ordered.filter((message) => {
    if (!isChatJoinNotice(message.content)) return true;
    const key = message.content.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    const at = message.createdAt ? new Date(message.createdAt).getTime() : Number.NaN;
    const previousAt = lastJoinByText.get(key);
    if (Number.isFinite(at)) {
      lastJoinByText.set(key, at);
      return previousAt == null || at - previousAt >= 20 * 60 * 1000;
    }
    if (previousAt != null) return false;
    lastJoinByText.set(key, Date.now());
    return true;
  });
}

export function loadCachedHumans<T extends ChatExtMsg>(): T[] {
  try {
    const raw = sessionStorage.getItem(HUMANS_CACHE_KEY) ?? sessionStorage.getItem("og_chat_humans_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => isDbMessageId(m.id) && isRealHuman(m)).slice(-CHAT_CACHE_LIMIT);
  } catch {
    return [];
  }
}

export function saveCachedHumans(messages: Array<{ id: number; userId: number; isBot?: boolean; isFake?: boolean; userRole?: string | null } & Record<string, unknown>>): void {
  try {
    const humans = messages.filter(isRealHuman).slice(-CHAT_CACHE_LIMIT);
    sessionStorage.setItem(HUMANS_CACHE_KEY, JSON.stringify(humans));
  } catch { /* quota */ }
}

/** Yeni kayıt → Aramıza Hoşgeldiniz */
export function greetNewMemberText(username: string): string {
  const u = username.replace(/^@/, "").trim();
  return `@${u} Aramıza Hoşgeldiniz! 👋`;
}

/** Sohbete katılan → Hoşgeldin */
export function welcomeChatJoinText(username: string): string {
  const u = username.replace(/^@/, "").trim();
  return `@${u} Hoşgeldin! 👋`;
}

/** @deprecated — greetNewMemberText */
export function greetText(username: string): string {
  return greetNewMemberText(username);
}

const GREET_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const GREET_COOLDOWN_KEY = "og_chat_greet_cooldown_v1";

export function canGreetUser(targetUsername: string, myUsername?: string | null): boolean {
  const target = targetUsername.replace(/^@/, "").trim().toLowerCase();
  const me = (myUsername ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!target) return false;
  if (me && target === me) return false;
  try {
    const raw = localStorage.getItem(GREET_COOLDOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const last = map[`${me || "_"}:${target}`] ?? 0;
    return Date.now() - last >= GREET_COOLDOWN_MS;
  } catch {
    return true;
  }
}

export function markGreetedUser(targetUsername: string, myUsername?: string | null): void {
  const target = targetUsername.replace(/^@/, "").trim().toLowerCase();
  const me = (myUsername ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!target) return;
  try {
    const raw = localStorage.getItem(GREET_COOLDOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[`${me || "_"}:${target}`] = Date.now();
    const cutoff = Date.now() - GREET_COOLDOWN_MS * 2;
    for (const k of Object.keys(map)) {
      if ((map[k] ?? 0) < cutoff) delete map[k];
    }
    localStorage.setItem(GREET_COOLDOWN_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}
