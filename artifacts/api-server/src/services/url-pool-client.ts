/**
 * Harici İlan Havuzu (wpbot Mesaj Havuzu + Medya Havuzu) istemcisi.
 * Örnek: https://wpbot-production-cf99.up.railway.app
 * Metin: GET {base}/api/whatsapp/messages
 * Medya OCR: GET {base}/api/whatsapp/media
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
  textTotal: number;
  mediaTotal: number;
  selectedGroupCount: number;
  listening: boolean;
  lastFetchAt: string | null;
  nextFetchAt: string | null;
};

export type UrlPoolPage = {
  messages: UrlPoolMessage[];
  total: number;
};

export type UrlPoolKind = "messages" | "media";

/** Kullanıcı URL'sini normalize et → origin (trailing slash yok; /medya yolu düşer) */
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

/** Kullanıcı /medya yapıştırdıysa medya havuzu olarak işaretle */
export function detectPoolKindFromUrl(input: string): UrlPoolKind {
  const raw = String(input ?? "").trim().toLowerCase();
  if (/\/medya(?:\/|$|\?|#)/.test(raw) || /\/media(?:\/|$|\?|#)/.test(raw)) return "media";
  return "messages";
}

function messagesUrl(base: string, limit: number, offset: number): string {
  const u = new URL("/api/whatsapp/messages", base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  return u.toString();
}

function mediaUrl(base: string, limit: number, offset: number): string {
  const u = new URL("/api/whatsapp/media", base.endsWith("/") ? base : `${base}/`);
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

/** Medya satırından OCR / metin alanını çıkar */
function extractMediaContent(raw: Record<string, unknown>): string {
  const candidates = [
    raw.content,
    raw.text,
    raw.ocrText,
    raw.ocr,
    raw.extractedText,
    raw.caption,
    raw.body,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return "";
}

function normalizePoolMessage(raw: unknown): UrlPoolMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const id = Number(m.id ?? 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    messageId: m.messageId != null ? String(m.messageId) : null,
    groupId: String(m.groupId ?? m.chatId ?? ""),
    groupName: String(m.groupName ?? m.chatName ?? m.group ?? ""),
    content: extractMediaContent(m),
    sender: String(m.sender ?? m.from ?? m.author ?? ""),
    timestamp: String(m.timestamp ?? m.createdAt ?? m.postedAt ?? ""),
    fetchedAt: m.fetchedAt != null ? String(m.fetchedAt) : null,
  };
}

export async function fetchPoolStats(baseUrl: string): Promise<UrlPoolStats> {
  const base = normalizePoolBaseUrl(baseUrl);
  if (!base) throw new Error("Geçersiz havuz URL");
  const data = await fetchJson<Partial<UrlPoolStats> & { mediaTotal?: number; textTotal?: number }>(statsUrl(base));
  const textTotal = Number(data.textTotal ?? data.total ?? 0);
  const mediaTotal = Number(data.mediaTotal ?? 0);
  return {
    total: Number(data.total ?? textTotal + mediaTotal),
    textTotal,
    mediaTotal,
    selectedGroupCount: Number(data.selectedGroupCount ?? 0),
    listening: Boolean(data.listening),
    lastFetchAt: data.lastFetchAt ?? null,
    nextFetchAt: data.nextFetchAt ?? null,
  };
}

export async function fetchPoolPage(
  baseUrl: string,
  opts?: { limit?: number; offset?: number; kind?: UrlPoolKind },
): Promise<UrlPoolPage> {
  const base = normalizePoolBaseUrl(baseUrl);
  if (!base) throw new Error("Geçersiz havuz URL");
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 100));
  const offset = Math.max(0, opts?.offset ?? 0);
  const kind = opts?.kind ?? "messages";
  const url = kind === "media" ? mediaUrl(base, limit, offset) : messagesUrl(base, limit, offset);
  const data = await fetchJson<{ messages?: unknown[]; total?: number; pool?: string }>(url);
  const messages = (Array.isArray(data.messages) ? data.messages : [])
    .map(normalizePoolMessage)
    .filter((m): m is UrlPoolMessage => !!m);
  return {
    messages,
    total: Number(data.total ?? messages.length),
  };
}

/** Tüm havuzu sayfalar halinde çek (üst sınır korumalı). */
export async function fetchAllPoolMessages(
  baseUrl: string,
  opts?: { pageSize?: number; maxPages?: number; minIdExclusive?: number; kind?: UrlPoolKind },
): Promise<UrlPoolMessage[]> {
  const pageSize = opts?.pageSize ?? 100;
  const maxPages = opts?.maxPages ?? 50;
  const minId = opts?.minIdExclusive ?? 0;
  const kind = opts?.kind ?? "messages";
  const out: UrlPoolMessage[] = [];

  for (let page = 0; page < maxPages; page++) {
    const { messages, total } = await fetchPoolPage(baseUrl, {
      limit: pageSize,
      offset: page * pageSize,
      kind,
    });
    if (!messages.length) break;

    for (const m of messages) {
      if (Number(m.id) > minId) out.push(m);
    }

    const oldestOnPage = Math.min(...messages.map((m) => Number(m.id) || 0));
    if (minId > 0 && oldestOnPage <= minId) break;
    if ((page + 1) * pageSize >= total) break;
  }

  out.sort((a, b) => Number(a.id) - Number(b.id));
  return out;
}

export function fetchAllMediaPoolMessages(
  baseUrl: string,
  opts?: { pageSize?: number; maxPages?: number; minIdExclusive?: number },
): Promise<UrlPoolMessage[]> {
  return fetchAllPoolMessages(baseUrl, { ...opts, kind: "media" });
}

export function poolMessageExternalId(m: UrlPoolMessage, kind: UrlPoolKind = "messages"): string {
  const prefix = kind === "media" ? "pool_media" : "pool";
  return `${prefix}_${Number(m.id) || 0}`;
}

export function poolMessageSourceUrl(baseUrl: string, m: UrlPoolMessage, kind: UrlPoolKind = "messages"): string {
  const base = normalizePoolBaseUrl(baseUrl) || baseUrl;
  const path = kind === "media" ? "medya" : "messages";
  return `${base}/${path}#${m.messageId || m.id}`;
}

export function isUrlPoolPlatform(platform: string | null | undefined): boolean {
  return platform === "url_pool" || platform === "url_pool_media";
}

export function poolKindFromPlatform(platform: string | null | undefined): UrlPoolKind {
  return platform === "url_pool_media" ? "media" : "messages";
}
