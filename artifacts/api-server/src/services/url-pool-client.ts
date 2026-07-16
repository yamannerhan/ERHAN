/**
 * Harici İlan Havuzu (wpbot Mesaj Havuzu) istemcisi.
 * Örnek: https://wpbot-production-cf99.up.railway.app
 * API: GET {base}/api/whatsapp/messages?limit=&offset=
 */

export type UrlPoolMessage = {
  id: number;
  messageId?: string | null;
  groupId: string;
  groupName: string;
  content: string;
  sender: string;
  timestamp: string;
  fetchedAt?: string | null;
};

export type UrlPoolStats = {
  total: number;
  selectedGroupCount: number;
  listening: boolean;
  lastFetchAt: string | null;
  nextFetchAt: string | null;
};

export type UrlPoolPage = {
  messages: UrlPoolMessage[];
  total: number;
};

/** Kullanıcı URL'sini normalize et → origin (trailing slash yok) */
export function normalizePoolBaseUrl(input: string): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function messagesUrl(base: string, limit: number, offset: number): string {
  const u = new URL("/api/whatsapp/messages", base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  return u.toString();
}

function statsUrl(base: string): string {
  return new URL("/api/whatsapp/messages/stats", base.endsWith("/") ? base : `${base}/`).toString();
}

async function fetchJson<T>(url: string, timeoutMs = 25_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "ozelguvenlik-url-pool/1.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Havuz HTTP ${res.status}: ${body.slice(0, 180) || res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPoolStats(baseUrl: string): Promise<UrlPoolStats> {
  const base = normalizePoolBaseUrl(baseUrl);
  if (!base) throw new Error("Geçersiz havuz URL");
  const data = await fetchJson<Partial<UrlPoolStats>>(statsUrl(base));
  return {
    total: Number(data.total ?? 0),
    selectedGroupCount: Number(data.selectedGroupCount ?? 0),
    listening: Boolean(data.listening),
    lastFetchAt: data.lastFetchAt ?? null,
    nextFetchAt: data.nextFetchAt ?? null,
  };
}

export async function fetchPoolPage(
  baseUrl: string,
  opts?: { limit?: number; offset?: number },
): Promise<UrlPoolPage> {
  const base = normalizePoolBaseUrl(baseUrl);
  if (!base) throw new Error("Geçersiz havuz URL");
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 100));
  const offset = Math.max(0, opts?.offset ?? 0);
  const data = await fetchJson<UrlPoolPage>(messagesUrl(base, limit, offset));
  return {
    messages: Array.isArray(data.messages) ? data.messages : [],
    total: Number(data.total ?? 0),
  };
}

/** Tüm havuzu sayfalar halinde çek (üst sınır korumalı). */
export async function fetchAllPoolMessages(
  baseUrl: string,
  opts?: { pageSize?: number; maxPages?: number; minIdExclusive?: number },
): Promise<UrlPoolMessage[]> {
  const pageSize = opts?.pageSize ?? 100;
  const maxPages = opts?.maxPages ?? 50;
  const minId = opts?.minIdExclusive ?? 0;
  const out: UrlPoolMessage[] = [];

  for (let page = 0; page < maxPages; page++) {
    const { messages, total } = await fetchPoolPage(baseUrl, {
      limit: pageSize,
      offset: page * pageSize,
    });
    if (!messages.length) break;

    for (const m of messages) {
      if (Number(m.id) > minId) out.push(m);
    }

    // API newest-first; bir sayfada tamamen eski id'ler geldiyse dur
    const oldestOnPage = Math.min(...messages.map((m) => Number(m.id) || 0));
    if (minId > 0 && oldestOnPage <= minId) break;
    if ((page + 1) * pageSize >= total) break;
  }

  // Eskiden yeniye işle
  out.sort((a, b) => Number(a.id) - Number(b.id));
  return out;
}

export function poolMessageExternalId(m: UrlPoolMessage): string {
  const mid = String(m.messageId || m.id).trim();
  return `pool_${mid}`;
}

export function poolMessageSourceUrl(baseUrl: string, m: UrlPoolMessage): string {
  const base = normalizePoolBaseUrl(baseUrl) || baseUrl;
  return `${base}/messages#${m.messageId || m.id}`;
}
