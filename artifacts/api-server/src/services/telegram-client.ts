import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { telegramSessionsTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";

// Accept standard or legacy swapped Railway variable names.
function resolveTelegramCredentials(): { apiId: number; apiHash: string } {
  const idRaw = process.env["TELEGRAM_API_ID"]?.trim() ?? "";
  const hashRaw = process.env["TELEGRAM_API_HASH"]?.trim() ?? "";

  if (/^\d+$/.test(idRaw) && hashRaw && !/^\d+$/.test(hashRaw)) {
    return { apiId: Number(idRaw), apiHash: hashRaw };
  }
  if (/^\d+$/.test(hashRaw) && idRaw && !/^\d+$/.test(idRaw)) {
    return { apiId: Number(hashRaw), apiHash: idRaw };
  }

  return { apiId: Number(idRaw) || 0, apiHash: hashRaw };
}

const { apiId: API_ID, apiHash: API_HASH } = resolveTelegramCredentials();

export type AuthState = "disconnected" | "awaiting_code" | "awaiting_password" | "connected";

let client: TelegramClient | null = null;
let currentState: AuthState = "disconnected";
let currentPhone: string | null = null;
let phoneCodeHash: string | null = null;
/** startAuth sırasında eski oturum string'i — yarım kalan girişte geri dönmek için */
let previousSessionString: string | null = null;

async function getSessionRow() {
  const rows = await db.select().from(telegramSessionsTable).limit(1);
  return rows[0] ?? null;
}

async function saveSession(patch: Partial<typeof telegramSessionsTable.$inferInsert>) {
  const row = await getSessionRow();
  if (row) {
    await db.update(telegramSessionsTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(telegramSessionsTable.id, row.id));
  } else {
    await db.insert(telegramSessionsTable).values({
      authState: "disconnected",
      ...patch,
    });
  }
}

function isSessionDeadError(err: unknown): boolean {
  const msg = String(
    (err as { errorMessage?: string })?.errorMessage
      ?? (err instanceof Error ? err.message : err),
  );
  return /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|USER_DEACTIVATED|AUTH_KEY_INVALID|SESSION_EXPIRED|AUTH_KEY_DUPLICATED/i.test(msg);
}

function buildClient(sessionStr = "", useWSS = true) {
  return new TelegramClient(
    new StringSession(sessionStr),
    API_ID,
    API_HASH,
    {
      connectionRetries: 5,
      useWSS,
      deviceModel: "Chrome",
      systemVersion: "Win32",
      appVersion: "1.0.0",
      langCode: "tr",
    },
  );
}

/** WSS (varsayılan) → TCP yedek; Railway/proxy ortamlarında TCP bazen düşer. */
async function connectClient(sessionStr: string): Promise<TelegramClient> {
  const preferWss = process.env["TELEGRAM_USE_WSS"] !== "0";
  const order = preferWss ? [true, false] : [false, true];
  let lastErr: unknown;
  for (const useWSS of order) {
    const c = buildClient(sessionStr, useWSS);
    try {
      await c.connect();
      return c;
    } catch (e) {
      lastErr = e;
      logger.warn({ err: e, useWSS }, "telegram-client: connect failed, trying fallback");
      try { await c.disconnect(); } catch { /* ignore */ }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function restoreSessionFromDb(forceReconnect = false): Promise<boolean> {
  const row = await getSessionRow();
  // Yarım kalan giriş (awaiting_*) olsa bile session_string varsa geri yükle — ayarları silme
  const sessionStr = row?.sessionString || previousSessionString;
  if (!sessionStr) {
    if (currentState !== "awaiting_code" && currentState !== "awaiting_password") {
      currentState = "disconnected";
    }
    return false;
  }

  // Canlı kod/şifre bekleniyorsa eski oturumu üstüne yazma
  if (
    !forceReconnect
    && client
    && (currentState === "awaiting_code" || currentState === "awaiting_password")
  ) {
    return false;
  }

  if (!forceReconnect && client && currentState === "connected") {
    try {
      if (await client.isUserAuthorized()) return true;
    } catch {
      /* yeniden bağlan */
    }
  }

  if (client) {
    try { await client.disconnect(); } catch { /* ignore */ }
    client = null;
  }

  try {
    client = await connectClient(sessionStr);
    if (await client.isUserAuthorized()) {
      currentState = "connected";
      currentPhone = row?.phone ?? currentPhone;
      previousSessionString = null;
      // authState awaiting_* kaldıysa connected'a çek (oturum string bozulmasın)
      if (row && row.authState !== "connected") {
        await saveSession({ authState: "connected", sessionString: sessionStr });
      }
      void onTelegramConnected();
      return true;
    }
  } catch (e) {
    logger.warn({ err: e }, "telegram-client: restore connect/auth failed");
    if (isSessionDeadError(e)) {
      await saveSession({ authState: "disconnected", sessionString: null });
      previousSessionString = null;
    }
    // Geçici hatalarda session_string'i SİLME — bir sonraki denemede tekrar dene
    currentState = "disconnected";
    client = null;
    return false;
  }

  // Yetkisiz ama oturum "ölü" değilse string'i koru
  currentState = "disconnected";
  try { await client?.disconnect(); } catch { /* ignore */ }
  client = null;
  await saveSession({ authState: "disconnected" });
  logger.warn("telegram-client: oturum yetkisiz — session string korundu, yeniden giriş gerekebilir");
  return false;
}

let connectMutex: Promise<boolean> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

function startTelegramKeepalive(): void {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    void (async () => {
      if (currentState !== "connected" && currentState !== "disconnected") return;
      if (!client && currentState === "disconnected") {
        await ensureTelegramConnected(3);
        return;
      }
      if (!client || currentState !== "connected") return;
      try {
        await client.invoke(new Api.updates.GetState());
      } catch (e) {
        logger.warn({ err: e }, "telegram-client: keepalive failed, reconnecting");
        // Mutex üzerinden yeniden bağlan — Inner'ı bypass etme
        currentState = "disconnected";
        await ensureTelegramConnected(5);
      }
    })();
  }, 45_000);
}

async function onTelegramConnected(): Promise<void> {
  startTelegramKeepalive();
}

async function ensureTelegramConnectedInner(retries = 3): Promise<boolean> {
  if (!API_ID || !API_HASH) {
    logger.warn("telegram-client: API_ID or API_HASH not configured");
    return false;
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    if (client && currentState === "connected") {
      try {
        if (await client.isUserAuthorized()) {
          void onTelegramConnected();
          return true;
        }
      } catch {
        currentState = "disconnected";
      }
    }

    try {
      if (await restoreSessionFromDb(attempt > 0 || currentState === "disconnected")) {
        void onTelegramConnected();
        if (attempt > 0) logger.info("telegram-client: oturum yeniden bağlandı");
        return true;
      }
    } catch (e) {
      logger.warn({ err: e, attempt }, "telegram-client: ensureTelegramConnected failed");
      currentState = "disconnected";
      client = null;
    }

    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return false;
}

/** Sunucu yeniden başladığında veya bağlantı koptuğunda oturumu DB'den yeniden kurar. */
export async function ensureTelegramConnected(retries = 3): Promise<boolean> {
  if (connectMutex) return connectMutex;
  connectMutex = ensureTelegramConnectedInner(retries).finally(() => {
    connectMutex = null;
  });
  return connectMutex;
}

export async function initTelegramClient(): Promise<void> {
  if (!API_ID || !API_HASH) {
    logger.warn("telegram-client: API_ID or API_HASH not configured");
    return;
  }
  try {
    if (await restoreSessionFromDb()) {
      logger.info("telegram-client: session restored, connected");
      return;
    }
    if (currentState !== "awaiting_code" && currentState !== "awaiting_password") {
      currentState = "disconnected";
    }
  } catch (e) {
    logger.warn({ err: e }, "telegram-client: failed to restore session");
    currentState = "disconnected";
    client = null;
  }
}

export async function startAuth(phone: string): Promise<void> {
  if (!API_ID || !API_HASH) {
    throw new Error(
      "Telegram API bilgileri eksik. Railway Variables'a TELEGRAM_API_ID (sayı) ve TELEGRAM_API_HASH ekleyin. Alın: https://my.telegram.org/apps",
    );
  }
  // Eski oturumu silme — yarım girişte geri yüklenebilsin
  const row = await getSessionRow();
  if (row?.sessionString) previousSessionString = row.sessionString;
  else if (client) {
    try { previousSessionString = (client.session as StringSession).save(); } catch { /* ignore */ }
  }

  if (client) {
    try { await client.disconnect(); } catch { /* ignore */ }
    client = null;
  }

  client = await connectClient("");
  const result = await client.invoke(new Api.auth.SendCode({
    phoneNumber: phone,
    apiId: API_ID,
    apiHash: API_HASH,
    settings: new Api.CodeSettings({}),
  }));
  phoneCodeHash = (result as { phoneCodeHash: string }).phoneCodeHash;
  currentPhone = phone;
  currentState = "awaiting_code";
  // sessionString'e dokunma — eski oturum DB'de kalsın
  await saveSession({ authState: "awaiting_code", phone, phoneCodeHash });
}

export async function verifyCode(code: string): Promise<{ needs2FA: boolean }> {
  if (!client || !currentPhone || !phoneCodeHash) throw new Error("Önce telefon numarası girin");
  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: currentPhone,
      phoneCodeHash,
      phoneCode: code,
    }));
    currentState = "connected";
    const sessionStr = (client.session as StringSession).save();
    previousSessionString = null;
    await saveSession({ authState: "connected", sessionString: sessionStr, phoneCodeHash: null });
    void onTelegramConnected();
    return { needs2FA: false };
  } catch (e: unknown) {
    const msg = (e as { errorMessage?: string }).errorMessage ?? String(e);
    if (msg === "SESSION_PASSWORD_NEEDED") {
      currentState = "awaiting_password";
      await saveSession({ authState: "awaiting_password" });
      return { needs2FA: true };
    }
    throw e;
  }
}

export async function verifyPassword(password: string): Promise<void> {
  if (!client) throw new Error("Oturum bulunamadı");
  const pwdInfo = await client.invoke(new Api.account.GetPassword());
  const passwordCheck = await (await import("telegram/Password")).computeCheck(pwdInfo, password);
  await client.invoke(passwordCheck as unknown as Api.AnyRequest);
  currentState = "connected";
  const sessionStr = (client.session as StringSession).save();
  previousSessionString = null;
  await saveSession({ authState: "connected", sessionString: sessionStr, phoneCodeHash: null });
  void onTelegramConnected();
}

export async function logout(): Promise<void> {
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  try { await client?.invoke(new Api.auth.LogOut({} as unknown as void)); } catch { /* ignore */ }
  client = null;
  currentState = "disconnected";
  currentPhone = null;
  phoneCodeHash = null;
  previousSessionString = null;
  await saveSession({ authState: "disconnected", sessionString: null, phone: null, phoneCodeHash: null });
}

/** Process kapanışı: sunucu oturumunu silmeden bağlantıyı kapatır. */
export async function shutdownTelegramClient(): Promise<void> {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  const activeClient = client;
  client = null;
  currentState = "disconnected";
  if (activeClient) {
    try {
      await activeClient.disconnect();
    } catch (error) {
      logger.warn({ err: error }, "telegram-client: shutdown disconnect failed");
    }
  }
}

export function getAuthState(): AuthState { return currentState; }
export function getCurrentPhone(): string | null { return currentPhone; }
export function isClientConnected(): boolean { return currentState === "connected" && client !== null; }

/** DB'de kayıtlı GramJS oturumu var mı? (deploy sonrası yeniden bağlanmak için) */
export async function hasTelegramSessionStored(): Promise<boolean> {
  if (previousSessionString) return true;
  try {
    const row = await getSessionRow();
    return !!(row?.sessionString);
  } catch {
    return false;
  }
}

export interface ChannelMessage {
  id: string;
  text: string;
  url: string;
  postedAt?: Date;
}

export interface FetchChannelResult {
  messages: ChannelMessage[];
  reachedCutoff: boolean;
  noMoreMessages: boolean;
  nextOffsetId: number;
  minIdInBatch: number;
  maxIdInBatch: number;
  /** true = GramJS oturumu yok / bağlanılamadı (boş kanal ile karıştırma) */
  notConnected?: boolean;
}

function mapGramMessage(username: string, m: { id: number; message?: string; date?: number }): ChannelMessage | null {
  const text = m.message?.trim() ?? "";
  if (text.length < 5) return null;
  return {
    id: String(m.id),
    text: text,
    url: `https://t.me/${username}/${m.id}`,
    postedAt: typeof m.date === "number" ? new Date(m.date * 1000) : undefined,
  };
}

const envPagesPerCycle = Number(process.env["SCRAPER_PAGES_PER_CYCLE"]);
const MAX_INITIAL_PAGES_TOTAL = 200;
/** Varsayılan 5 sayfa/döngü (×100) — 1 çok yavaş kalıyordu, 30 güne inemiyordu */
export const PAGES_PER_CYCLE = Number.isFinite(envPagesPerCycle) && envPagesPerCycle > 0 ? envPagesPerCycle : 5;
const BATCH_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseFloodWaitSeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/FLOOD_WAIT[_\s](\d+)/i) ?? msg.match(/wait of (\d+) seconds/i);
  return m?.[1] ? parseInt(m[1], 10) : null;
}

async function withTelegramRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(`telegram timeout: ${label}`)), 45_000);
        }),
      ]);
    } catch (err) {
      const waitSec = parseFloodWaitSeconds(err);
      if (waitSec != null && attempt < 3) {
        // Uzun FLOOD_WAIT tüm kuyruğu dondurmasın
        const delay = (Math.min(waitSec, 40) + 1) * 1000;
        logger.warn({ label, waitSec, cappedSec: Math.min(waitSec, 40), attempt }, "telegram-client: rate limit, bekleniyor");
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`telegram-client: ${label} retry exhausted`);
}

/** GramJS ile kanal mesajlarını çeker. İlk tarama: maxAgeDays geriye sayfalı; sonraki: minMessageId sonrası. */
export async function fetchChannelMessages(
  username: string,
  options: { minMessageId?: number; maxAgeDays?: number; offsetId?: number; maxPages?: number } = {},
): Promise<FetchChannelResult> {
  const fallbackOffset = options.offsetId ?? 0;
  const empty: FetchChannelResult = {
    messages: [], reachedCutoff: false, noMoreMessages: false,
    nextOffsetId: fallbackOffset, minIdInBatch: 0, maxIdInBatch: 0,
  };
  const connected = await ensureTelegramConnected(5);
  if (!connected || !client) {
    return { ...empty, notConnected: true };
  }

  const minId = options.minMessageId ?? 0;
  const maxAgeDays = options.maxAgeDays ?? 30;
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const entity = await withTelegramRetry(() => client!.getEntity(username), `getEntity:${username}`);
  const results: ChannelMessage[] = [];
  const seen = new Set<number>();

  // Artımlı tarama: en yeniden geriye doğru yürü, lastId'ye kadar tüm boşluğu kapat
  // (sadece minId ile newest-page almak 100+ birikimde ara mesajları kaçırıyordu)
  if (minId > 0) {
    let offsetId = 0;
    let page = 0;
    const maxPages = options.maxPages ?? 20;
    let reachedCursor = false;
    while (page < maxPages) {
      const batch = await withTelegramRetry(
        () => client!.getMessages(entity, {
          limit: 100,
          minId,
          ...(offsetId > 0 ? { offsetId } : {}),
        }),
        `getMessages:${username}:inc${page}`,
      );
      if (!batch.length) {
        reachedCursor = true;
        break;
      }

      let oldestInBatch = Number.POSITIVE_INFINITY;
      for (const m of batch) {
        if (m.id < oldestInBatch) oldestInBatch = m.id;
        if (m.id <= minId) {
          reachedCursor = true;
          continue;
        }
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const mapped = mapGramMessage(username, m);
        if (mapped) results.push(mapped);
      }

      if (reachedCursor || oldestInBatch <= minId + 1) {
        reachedCursor = true;
        break;
      }
      if (batch.length < 100) {
        reachedCursor = true;
        break;
      }
      const nextOffset = batch[batch.length - 1]?.id ?? 0;
      if (!nextOffset || nextOffset === offsetId) {
        reachedCursor = true;
        break;
      }
      offsetId = nextOffset;
      page++;
      await sleep(BATCH_DELAY_MS);
    }
    return {
      messages: results.sort((a, b) => Number(a.id) - Number(b.id)),
      reachedCutoff: false,
      noMoreMessages: reachedCursor,
      nextOffsetId: 0,
      minIdInBatch: results.length ? Math.min(...results.map(m => Number(m.id))) : 0,
      maxIdInBatch: results.length ? Math.max(...results.map(m => Number(m.id))) : 0,
    };
  }

  // İlk tarama: geriye doğru sayfalı, her döngüde sınırlı sayfa
  let offsetId = options.offsetId ?? 0;
  const maxPages = options.maxPages ?? PAGES_PER_CYCLE;
  let reachedCutoff = false;
  let noMoreMessages = false;
  let batchMinId = 0;
  let batchMaxId = 0;

  for (let page = 0; page < maxPages; page++) {
    const batch = await withTelegramRetry(
      () => client!.getMessages(entity, {
        limit: 100,
        ...(offsetId > 0 ? { offsetId } : {}),
      }),
      `getMessages:${username}:page${page}`,
    );
    if (!batch.length) {
      noMoreMessages = true;
      break;
    }

    for (const m of batch) {
      if (batchMinId === 0 || m.id < batchMinId) batchMinId = m.id;
      if (m.id > batchMaxId) batchMaxId = m.id;
      const ts = typeof m.date === "number" ? m.date * 1000 : 0;
      if (ts > 0 && ts < cutoffMs) {
        reachedCutoff = true;
        continue;
      }
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const mapped = mapGramMessage(username, m);
      if (mapped) results.push(mapped);
    }

    if (reachedCutoff) break;

    const last = batch[batch.length - 1];
    if (!last) {
      noMoreMessages = true;
      break;
    }
    const prevOffset = offsetId;
    offsetId = last.id;
    if (offsetId === prevOffset) {
      noMoreMessages = true;
      break;
    }
    if (page < maxPages - 1) await sleep(BATCH_DELAY_MS);
  }

  return {
    messages: results.sort((a, b) => Number(a.id) - Number(b.id)),
    reachedCutoff,
    noMoreMessages,
    nextOffsetId: offsetId,
    minIdInBatch: batchMinId,
    maxIdInBatch: batchMaxId,
  };
}

/** @deprecated fetchChannelMessages kullanın */
export async function fetchMessagesViaClient(username: string, limit = 100): Promise<ChannelMessage[]> {
  if (!client || !isClientConnected()) return [];
  const entity = await client.getEntity(username);
  const messages = await client.getMessages(entity, { limit });
  return messages
    .map(m => mapGramMessage(username, m))
    .filter((m): m is ChannelMessage => m !== null);
}

// Bot API helpers (still available for polling)
const BOT_TOKEN = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
const BOT_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface BotUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number; username?: string; title?: string; type: string }; text?: string; date: number };
  channel_post?: { message_id: number; chat: { id: number; username?: string; title?: string; type: string }; text?: string; date: number };
}

export function isBotTokenSet(): boolean { return BOT_TOKEN.length > 10; }

export async function getUpdates(offset: number, limit = 100): Promise<BotUpdate[]> {
  if (!isBotTokenSet()) return [];
  try {
    const url = `${BOT_BASE}/getUpdates?offset=${offset}&limit=${limit}&timeout=0&allowed_updates=["message","channel_post"]`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await res.json() as { ok: boolean; result?: BotUpdate[] };
    return data.ok ? (data.result ?? []) : [];
  } catch { return []; }
}

export async function getBotInfo(): Promise<{ id: number; username: string; firstName: string } | null> {
  if (!isBotTokenSet()) return null;
  try {
    const res = await fetch(`${BOT_BASE}/getMe`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as { ok: boolean; result?: { id: number; username: string; first_name: string } };
    if (!data.ok || !data.result) return null;
    return { id: data.result.id, username: data.result.username, firstName: data.result.first_name };
  } catch { return null; }
}
