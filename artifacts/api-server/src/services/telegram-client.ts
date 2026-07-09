import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
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

async function getSessionRow() {
  const rows = await db.select().from(telegramSessionsTable).limit(1);
  return rows[0] ?? null;
}

async function saveSession(patch: Partial<typeof telegramSessionsTable.$inferInsert>) {
  const row = await getSessionRow();
  if (row) {
    await db.update(telegramSessionsTable).set({ ...patch, updatedAt: new Date() });
  } else {
    await db.insert(telegramSessionsTable).values({
      authState: "disconnected",
      ...patch,
    });
  }
}

function buildClient(sessionStr = "") {
  return new TelegramClient(
    new StringSession(sessionStr),
    API_ID,
    API_HASH,
    {
      connectionRetries: 3,
      useWSS: false,
      deviceModel: "Chrome",
      systemVersion: "Win32",
      appVersion: "1.0.0",
      langCode: "tr",
    },
  );
}

export async function initTelegramClient(): Promise<void> {
  if (!API_ID || !API_HASH) {
    logger.warn("telegram-client: API_ID or API_HASH not configured");
    return;
  }
  try {
    const row = await getSessionRow();
    if (row?.authState === "connected" && row.sessionString) {
      client = buildClient(row.sessionString);
      await client.connect();
      if (await client.isUserAuthorized()) {
        currentState = "connected";
        currentPhone = row.phone ?? null;
        logger.info("telegram-client: session restored, connected");
        return;
      }
    }
    currentState = "disconnected";
    await saveSession({ authState: "disconnected" });
  } catch (e) {
    logger.warn({ err: e }, "telegram-client: failed to restore session");
    currentState = "disconnected";
  }
}

export async function startAuth(phone: string): Promise<void> {
  if (!API_ID || !API_HASH) {
    throw new Error(
      "Telegram API bilgileri eksik. Railway Variables'a TELEGRAM_API_ID (sayı) ve TELEGRAM_API_HASH ekleyin. Alın: https://my.telegram.org/apps",
    );
  }
  client = buildClient();
  await client.connect();
  const result = await client.invoke(new Api.auth.SendCode({
    phoneNumber: phone,
    apiId: API_ID,
    apiHash: API_HASH,
    settings: new Api.CodeSettings({}),
  }));
  phoneCodeHash = (result as { phoneCodeHash: string }).phoneCodeHash;
  currentPhone = phone;
  currentState = "awaiting_code";
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
    await saveSession({ authState: "connected", sessionString: sessionStr });
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
  await client.invoke(await (await import("telegram/Password")).computeCheck(pwdInfo, password));
  currentState = "connected";
  const sessionStr = (client.session as StringSession).save();
  await saveSession({ authState: "connected", sessionString: sessionStr });
}

export async function logout(): Promise<void> {
  try { await client?.invoke(new Api.auth.LogOut({})); } catch { /* ignore */ }
  client = null;
  currentState = "disconnected";
  currentPhone = null;
  phoneCodeHash = null;
  await saveSession({ authState: "disconnected", sessionString: null, phone: null, phoneCodeHash: null });
}

export function getAuthState(): AuthState { return currentState; }
export function getCurrentPhone(): string | null { return currentPhone; }
export function isClientConnected(): boolean { return currentState === "connected" && client !== null; }

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
}

function mapGramMessage(username: string, m: { id: number; message?: string; date?: number }): ChannelMessage | null {
  if (!m.message || m.message.length < 10) return null;
  return {
    id: String(m.id),
    text: m.message,
    url: `https://t.me/${username}/${m.id}`,
    postedAt: typeof m.date === "number" ? new Date(m.date * 1000) : undefined,
  };
}

const envPagesPerCycle = Number(process.env["SCRAPER_PAGES_PER_CYCLE"]);
const PAGES_PER_CYCLE = Number.isFinite(envPagesPerCycle) && envPagesPerCycle > 0 ? envPagesPerCycle : 25;
const BATCH_DELAY_MS = 1_500;

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
      return await fn();
    } catch (err) {
      const waitSec = parseFloodWaitSeconds(err);
      if (waitSec != null && attempt < 3) {
        const delay = (waitSec + 1) * 1000;
        logger.warn({ label, waitSec, attempt }, "telegram-client: rate limit, bekleniyor");
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
  const empty: FetchChannelResult = { messages: [], reachedCutoff: false, noMoreMessages: true, nextOffsetId: 0 };
  if (!client || !isClientConnected()) return empty;

  const minId = options.minMessageId ?? 0;
  const maxAgeDays = options.maxAgeDays ?? 30;
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const entity = await withTelegramRetry(() => client!.getEntity(username), `getEntity:${username}`);
  const results: ChannelMessage[] = [];
  const seen = new Set<number>();

  // Artımlı tarama: son bilinen mesajdan sonrakiler (100+ mesaj için sayfalı)
  if (minId > 0) {
    let cursorMinId = minId;
    let page = 0;
    const maxPages = options.maxPages ?? 10;
    while (page < maxPages) {
      const batch = await withTelegramRetry(
        () => client!.getMessages(entity, { limit: 100, minId: cursorMinId }),
        `getMessages:${username}`,
      );
      if (!batch.length) break;

      let maxInBatch = cursorMinId;
      for (const m of batch) {
        if (m.id <= minId) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        if (m.id > maxInBatch) maxInBatch = m.id;
        const mapped = mapGramMessage(username, m);
        if (mapped) results.push(mapped);
      }

      if (batch.length < 100 || maxInBatch <= cursorMinId) break;
      cursorMinId = maxInBatch;
      page++;
      await sleep(BATCH_DELAY_MS);
    }
    return {
      messages: results.sort((a, b) => Number(a.id) - Number(b.id)),
      reachedCutoff: false,
      noMoreMessages: true,
      nextOffsetId: 0,
    };
  }

  // İlk tarama: geriye doğru sayfalı, her döngüde sınırlı sayfa
  let offsetId = options.offsetId ?? 0;
  const maxPages = options.maxPages ?? PAGES_PER_CYCLE;
  let reachedCutoff = false;
  let noMoreMessages = false;

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
    if (!last || batch.length < 100) {
      noMoreMessages = true;
      break;
    }
    offsetId = last.id;
    if (page < maxPages - 1) await sleep(BATCH_DELAY_MS);
  }

  return {
    messages: results.sort((a, b) => Number(a.id) - Number(b.id)),
    reachedCutoff,
    noMoreMessages,
    nextOffsetId: offsetId,
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
