import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { db } from "@workspace/db";
import { telegramSessionsTable } from "@workspace/db/schema";
import { logger } from "../lib/logger";

// NOTE: env vars are stored swapped — we read them in reverse intentionally
const API_ID   = Number(process.env["TELEGRAM_API_HASH"]);  // stores the numeric ID
const API_HASH = process.env["TELEGRAM_API_ID"] ?? "";       // stores the hash string

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

export async function fetchMessagesViaClient(username: string, limit = 50): Promise<{ id: string; text: string; url: string; postedAt?: Date }[]> {
  if (!client || !isClientConnected()) return [];
  const entity = await client.getEntity(username);
  const messages = await client.getMessages(entity, { limit });
  return messages
    .filter(m => m.message && m.message.length > 30)
    .map(m => ({
      id: String(m.id),
      text: m.message,
      url: `https://t.me/${username}/${m.id}`,
      // m.date Telegram'da unix saniye — gerçek gönderim tarihi
      postedAt: typeof m.date === "number" ? new Date(m.date * 1000) : undefined,
    }));
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
