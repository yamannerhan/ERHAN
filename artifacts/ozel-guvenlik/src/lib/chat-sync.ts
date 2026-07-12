/** Sohbet: son 100 üye mesajını yenilemede kaybetmeme yardımcıları */

export type ChatExtMsg = {
  id: number;
  userId: number;
  content: string;
  username: string;
  isBot?: boolean;
  isFake?: boolean;
  userRole?: string | null;
  [key: string]: unknown;
};

const HUMANS_CACHE_KEY = "og_chat_humans_v1";

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
  return /aramıza katıldı|hoşgeldin/i.test(msg.content ?? "");
}

export function extractJoinUsername(text: string): string | null {
  // "Ali sohbete katıldı" | "Ali aramıza katıldı..."
  const m = text.match(/^@?(\w+)\s+(?:sohbete\s+katıldı|aramıza\s+katıldı)/i)
    || text.match(/(\w+)\s+aramıza\s+katıldı/i);
  return m?.[1] ?? null;
}

/** Her senkron: incremental + her zaman son 100 üye */
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
      ? fetchJson(`/api/chat/messages?limit=100&after=${after}`)
      : fetchJson("/api/chat/messages?limit=100"),
    // KRİTİK: after yolu üye mesajlarını atlamasın — her seferinde son 100 üye
    fetchJson("/api/chat/messages?limit=100&humansOnly=1"),
  ]);

  const byId = new Map<number, ChatExtMsg>();
  for (const m of [...mixedOrInc, ...humans]) {
    if (isDbMessageId(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function loadCachedHumans<T extends ChatExtMsg>(): T[] {
  try {
    const raw = sessionStorage.getItem(HUMANS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => isDbMessageId(m.id) && isRealHuman(m)).slice(-100);
  } catch {
    return [];
  }
}

export function saveCachedHumans(messages: Array<{ id: number; userId: number; isBot?: boolean; isFake?: boolean; userRole?: string | null } & Record<string, unknown>>): void {
  try {
    const humans = messages.filter(isRealHuman).slice(-100);
    sessionStorage.setItem(HUMANS_CACHE_KEY, JSON.stringify(humans));
  } catch { /* quota */ }
}

export function greetText(username: string): string {
  const u = username.replace(/^@/, "").trim();
  return `@${u} Aramıza Hoşgeldiniz! 👋`;
}
