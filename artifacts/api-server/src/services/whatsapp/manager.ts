import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { db, whatsappSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger";
import { getSessionLock } from "./mutex";
import { isValidWaPhone, maskChatId, maskPhone, normalizeTurkishWhatsAppPhone } from "./phone";
import {
  DEFAULT_SESSION_ID,
  type ConnectionMode,
  type WhatsAppChatSummary,
  type WhatsAppSessionStatus,
} from "./types";

const require = createRequire(import.meta.url);

type WaClient = {
  initialize: () => Promise<void>;
  destroy: () => Promise<void>;
  getState: () => Promise<string | null>;
  getChats: () => Promise<unknown[]>;
  getChatById: (id: string) => Promise<unknown>;
  requestPairingCode?: (phone: string) => Promise<string>;
  pupPage?: { isClosed?: () => boolean } | null;
  info?: { wid?: { user?: string } };
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  removeAllListeners?: (event?: string) => void;
};

export class WhatsAppClientError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public code = "WA_ERROR",
  ) {
    super(message);
    this.name = "WhatsAppClientError";
  }
}

interface SessionRuntime {
  sessionId: string;
  client: WaClient | null;
  clientInstanceId: string | null;
  status: WhatsAppSessionStatus;
  mode: ConnectionMode | null;
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneMasked: string | null;
  lastError: string | null;
  readyAt: Date | null;
  starting: boolean;
  updatedAt: Date;
}

const clients = new Map<string, WaClient>();
const sessionStates = new Map<string, SessionRuntime>();
const sessionLocks = new Map<string, ReturnType<typeof getSessionLock>>();

let ClientCtor: (new (opts: unknown) => WaClient) | null = null;
let LocalAuthCtor: (new (opts: unknown) => unknown) | null = null;
let wwebjsVersion = "unknown";

const AUTH_PATH =
  process.env.WHATSAPP_AUTH_PATH
  || process.env.WWEBJS_AUTH_PATH
  || (fs.existsSync("/data") ? "/data/whatsapp-auth" : path.join(process.cwd(), ".wwebjs_auth"));

const PROTOCOL_TIMEOUT_MS = Math.max(60_000, Number(process.env.WHATSAPP_PROTOCOL_TIMEOUT_MS ?? 300_000));

function lockFor(sessionId: string) {
  let m = sessionLocks.get(sessionId);
  if (!m) {
    m = getSessionLock(sessionId);
    sessionLocks.set(sessionId, m);
  }
  return m;
}

function getOrCreateState(sessionId: string): SessionRuntime {
  let s = sessionStates.get(sessionId);
  if (!s) {
    s = {
      sessionId,
      client: null,
      clientInstanceId: null,
      status: "IDLE",
      mode: null,
      qrDataUrl: null,
      pairingCode: null,
      phoneMasked: null,
      lastError: null,
      readyAt: null,
      starting: false,
      updatedAt: new Date(),
    };
    sessionStates.set(sessionId, s);
  }
  return s;
}

async function persistSessionMeta(s: SessionRuntime): Promise<void> {
  try {
    await db.insert(whatsappSessionsTable).values({
      id: s.sessionId,
      status: s.status,
      connectionMode: s.mode,
      phoneMasked: s.phoneMasked,
      lastError: s.lastError,
      clientInstanceId: s.clientInstanceId,
      readyAt: s.readyAt,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: whatsappSessionsTable.id,
      set: {
        status: s.status,
        connectionMode: s.mode,
        phoneMasked: s.phoneMasked,
        lastError: s.lastError,
        clientInstanceId: s.clientInstanceId,
        readyAt: s.readyAt,
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn({ err, sessionId: s.sessionId }, "wa: session meta persist failed");
  }
}

function setStatus(s: SessionRuntime, status: WhatsAppSessionStatus, error?: string | null): void {
  s.status = status;
  s.updatedAt = new Date();
  if (error !== undefined) s.lastError = error;
  if (status === "READY") s.readyAt = new Date();
  void persistSessionMeta(s);
}

function loadWhatsAppModule(): void {
  if (ClientCtor && LocalAuthCtor) return;
  const mod = require("whatsapp-web.js") as {
    Client: new (opts: unknown) => WaClient;
    LocalAuth: new (opts: unknown) => unknown;
    version?: string;
  };
  ClientCtor = mod.Client;
  LocalAuthCtor = mod.LocalAuth;
  try {
    wwebjsVersion = String(require("whatsapp-web.js/package.json").version ?? "unknown");
  } catch {
    wwebjsVersion = "unknown";
  }
  if (!ClientCtor || !LocalAuthCtor) {
    throw new WhatsAppClientError("whatsapp-web.js Client/LocalAuth yüklenemedi", 500, "WWEBJS_LOAD");
  }
}

function resolveChromiumPath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const puppeteer = require("puppeteer") as { executablePath?: () => string };
    if (typeof puppeteer.executablePath === "function") {
      const p = puppeteer.executablePath();
      if (p && fs.existsSync(p)) return p;
    }
  } catch { /* ignore */ }
  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function sessionAuthDir(sessionId: string): string {
  return path.join(AUTH_PATH, `session-${sessionId}`);
}

function hasLocalAuthFiles(sessionId: string): boolean {
  const dir = sessionAuthDir(sessionId);
  try {
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

async function destroyClient(sessionId: string): Promise<void> {
  const existing = clients.get(sessionId);
  const s = getOrCreateState(sessionId);
  if (!existing) {
    s.client = null;
    s.clientInstanceId = null;
    return;
  }
  try {
    existing.removeAllListeners?.();
  } catch { /* ignore */ }
  try {
    await Promise.race([
      existing.destroy(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("destroy timeout")), 15_000)),
    ]);
  } catch (err) {
    logger.warn({ err, sessionId }, "wa: client destroy warning");
  }
  clients.delete(sessionId);
  s.client = null;
  s.clientInstanceId = null;
}

function classifyChat(chat: Record<string, unknown>): { isGroup: boolean; isChannel: boolean } {
  const id = String(chat.id && typeof chat.id === "object"
    ? (chat.id as { _serialized?: string })._serialized ?? ""
    : chat.id ?? "");
  const isChannel = id.includes("@newsletter")
    || Boolean(chat.isChannel)
    || Boolean(chat.isNewsletter);
  const isGroup = Boolean(chat.isGroup) || id.endsWith("@g.us");
  return { isGroup: isGroup && !isChannel, isChannel };
}

function chatNameOf(chat: Record<string, unknown>): string {
  return String(chat.name || chat.formattedTitle || chat.pushname || "İsimsiz grup");
}

function chatIdOf(chat: Record<string, unknown>): string {
  if (chat.id && typeof chat.id === "object") {
    return String((chat.id as { _serialized?: string })._serialized ?? "");
  }
  return String(chat.id ?? "");
}

function lastMessageAtOf(chat: Record<string, unknown>): string | null {
  const ts = (chat.timestamp as number | undefined)
    ?? (chat.lastMessage && typeof chat.lastMessage === "object"
      ? (chat.lastMessage as { timestamp?: number }).timestamp
      : undefined);
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

function attachHandlers(sessionId: string, client: WaClient): void {
  const s = getOrCreateState(sessionId);

  client.on("qr", (qr) => {
    void (async () => {
      if (s.mode === "PAIRING_CODE") {
        logger.info({ sessionId, operation: "qr_ignored_pairing_mode" }, "wa: QR ignored in pairing mode");
        return;
      }
      try {
        s.qrDataUrl = await QRCode.toDataURL(String(qr), { margin: 1, width: 280 });
        s.pairingCode = null;
        setStatus(s, "QR_READY", null);
        logger.info({ sessionId, operation: "qr_ready", clientInstanceId: s.clientInstanceId }, "wa: QR ready");
      } catch (err) {
        setStatus(s, "FAILED", err instanceof Error ? err.message : "QR üretilemedi");
      }
    })();
  });

  client.on("authenticated", () => {
    s.qrDataUrl = null;
    s.pairingCode = null;
    setStatus(s, "AUTHENTICATED", null);
    logger.info({ sessionId, operation: "authenticated", clientInstanceId: s.clientInstanceId }, "wa: authenticated");
  });

  client.on("ready", () => {
    s.qrDataUrl = null;
    s.pairingCode = null;
    s.starting = false;
    const widUser = client.info?.wid?.user;
    if (widUser) s.phoneMasked = maskPhone(widUser.startsWith("90") ? widUser : `90${widUser}`);
    setStatus(s, "CONNECTED", null);
    setStatus(s, "SYNCING", null);
    logger.info({ sessionId, operation: "ready_event", clientInstanceId: s.clientInstanceId }, "wa: ready event → syncing chats");
    void markReadyAfterChats(sessionId);
  });

  client.on("auth_failure", (msg) => {
    s.starting = false;
    setStatus(s, "FAILED", String(msg || "auth_failure"));
    logger.error({ sessionId, operation: "auth_failure", error: String(msg) }, "wa: auth_failure");
  });

  client.on("disconnected", (reason) => {
    s.starting = false;
    s.qrDataUrl = null;
    s.pairingCode = null;
    setStatus(s, "DISCONNECTED", String(reason || "disconnected"));
    clients.delete(sessionId);
    s.client = null;
    logger.warn({ sessionId, operation: "disconnected", reason: String(reason) }, "wa: disconnected");
  });
}

async function markReadyAfterChats(sessionId: string): Promise<void> {
  const s = getOrCreateState(sessionId);
  const client = clients.get(sessionId);
  if (!client) return;
  // Bağlantı zaten CONNECTED; sohbet yükleme gecikmesi FAILED yapmaz.
  const started = Date.now();
  try {
    await Promise.race([
      client.getChats(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("getChats timeout")), 120_000)),
    ]);
    setStatus(s, "READY", null);
    logger.info({
      sessionId,
      operation: "sync_ready",
      durationMs: Date.now() - started,
      clientInstanceId: s.clientInstanceId,
    }, "wa: chats synced → READY");
    void import("../../workers/scraper")
      .then((m) => { if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady(); })
      .catch(() => undefined);
  } catch (err) {
    // Hâlâ CONNECTED; UI sohbetleri sonra tekrar deneyebilir.
    setStatus(s, "CONNECTED", err instanceof Error ? err.message : "Sohbet senkronu gecikti");
    logger.warn({
      sessionId,
      operation: "sync_deferred",
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }, "wa: getChats delayed; connection stays CONNECTED");
    // Arka planda READY'ye yükseltmeyi dene
    setTimeout(() => {
      void (async () => {
        try {
          const c = clients.get(sessionId);
          if (!c) return;
          await c.getChats();
          const st = getOrCreateState(sessionId);
          if (st.status === "CONNECTED" || st.status === "SYNCING") {
            setStatus(st, "READY", null);
            void import("../../workers/scraper")
              .then((m) => { if (typeof m.onWhatsAppReady === "function") m.onWhatsAppReady(); })
              .catch(() => undefined);
          }
        } catch { /* ignore */ }
      })();
    }, 30_000);
  }
}

async function createClient(sessionId: string): Promise<WaClient> {
  loadWhatsAppModule();
  fs.mkdirSync(AUTH_PATH, { recursive: true });
  const executablePath = resolveChromiumPath();
  const instanceId = randomUUID();
  const client = new ClientCtor!({
    authStrategy: new LocalAuthCtor!({ clientId: sessionId, dataPath: AUTH_PATH }),
    puppeteer: {
      headless: true,
      executablePath,
      protocolTimeout: PROTOCOL_TIMEOUT_MS,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--mute-audio",
      ],
    },
    restartOnAuthFail: false,
  });
  attachHandlers(sessionId, client);
  const s = getOrCreateState(sessionId);
  s.client = client;
  s.clientInstanceId = instanceId;
  clients.set(sessionId, client);
  logger.info({
    sessionId,
    clientInstanceId: instanceId,
    authPath: AUTH_PATH,
    executablePath: executablePath ?? "bundled",
    wwebjsVersion,
    protocolTimeoutMs: PROTOCOL_TIMEOUT_MS,
    operation: "client_created",
  }, "wa: client created");
  return client;
}

export class WhatsAppClientManager {
  static getAuthPath(): string {
    return AUTH_PATH;
  }

  static getWwebjsVersion(): string {
    try {
      loadWhatsAppModule();
    } catch { /* ignore */ }
    return wwebjsVersion;
  }

  static getPuppeteerVersion(): string {
    try {
      return String(require("puppeteer/package.json").version ?? "unknown");
    } catch {
      return "unknown";
    }
  }

  static getStatus(sessionId = DEFAULT_SESSION_ID) {
    const s = getOrCreateState(sessionId);
    const connected = ["AUTHENTICATED", "CONNECTED", "SYNCING", "READY"].includes(s.status);
    const ready = s.status === "READY";
    return {
      sessionId,
      status: s.status,
      connectionMode: s.mode,
      connected,
      ready,
      starting: s.starting,
      qr: s.mode === "qr" ? s.qrDataUrl : null,
      pairingCode: s.mode === "PAIRING_CODE" ? s.pairingCode : null,
      phoneMasked: s.phoneMasked,
      error: s.lastError,
      clientInstanceId: s.clientInstanceId,
      readyAt: s.readyAt?.toISOString() ?? null,
      updatedAt: s.updatedAt.toISOString(),
      hasLocalAuth: hasLocalAuthFiles(sessionId),
      authPath: AUTH_PATH,
      wwebjsVersion: WhatsAppClientManager.getWwebjsVersion(),
      puppeteerVersion: WhatsAppClientManager.getPuppeteerVersion(),
    };
  }

  static getClient(sessionId = DEFAULT_SESSION_ID): WaClient | null {
    return clients.get(sessionId) ?? null;
  }

  static isReady(sessionId = DEFAULT_SESSION_ID): boolean {
    return getOrCreateState(sessionId).status === "READY"
      || getOrCreateState(sessionId).status === "CONNECTED";
  }

  /** Boot: LocalAuth varsa tek client ile otomatik bağlan. */
  static async init(sessionId = DEFAULT_SESSION_ID): Promise<void> {
    if (!hasLocalAuthFiles(sessionId) && !fs.existsSync(path.join(AUTH_PATH, `session-${sessionId}`))) {
      // LocalAuth clientId klasör adı session-<id>
      const alt = path.join(AUTH_PATH, `session-${sessionId}`);
      if (!fs.existsSync(alt) && !hasLocalAuthFiles(sessionId)) {
        logger.info({ sessionId, authPath: AUTH_PATH }, "wa: no local auth — waiting for panel connect");
        return;
      }
    }
    try {
      await this.connectQr(sessionId, { restore: true });
    } catch (err) {
      logger.warn({ err, sessionId }, "wa: auto restore failed");
    }
  }

  static async connectQr(sessionId = DEFAULT_SESSION_ID, opts?: { restore?: boolean }) {
    return lockFor(sessionId).runExclusive(async () => {
      const s = getOrCreateState(sessionId);
      if (s.mode === "PAIRING_CODE" && s.starting) {
        throw new WhatsAppClientError(
          "Onay kodu bağlantısı devam ediyor. Önce iptal edin veya tamamlanmasını bekleyin.",
          409,
          "MODE_CONFLICT",
        );
      }
      if (clients.has(sessionId) && ["READY", "CONNECTED", "SYNCING", "AUTHENTICATED"].includes(s.status)) {
        return this.getStatus(sessionId);
      }

      await destroyClient(sessionId);
      s.mode = "qr";
      s.pairingCode = null;
      s.qrDataUrl = null;
      s.phoneMasked = null;
      s.starting = true;
      s.lastError = null;
      setStatus(s, "STARTING", null);

      const client = await createClient(sessionId);
      void client.initialize().catch((err) => {
        s.starting = false;
        setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        logger.error({ err, sessionId, operation: "initialize" }, "wa: initialize failed");
      });

      logger.info({
        sessionId,
        operation: "connect_qr",
        restore: Boolean(opts?.restore),
        clientInstanceId: s.clientInstanceId,
      }, "wa: QR connect started");
      return this.getStatus(sessionId);
    });
  }

  static async connectPairingCode(phoneNumber: string, sessionId = DEFAULT_SESSION_ID) {
    return lockFor(sessionId).runExclusive(async () => {
      const normalized = normalizeTurkishWhatsAppPhone(phoneNumber);
      if (!normalized || !isValidWaPhone(normalized)) {
        throw new WhatsAppClientError(
          "Geçersiz Türkiye telefon numarası. 0532..., 532... veya 90532... formatını kullanın.",
          400,
          "INVALID_PHONE",
        );
      }

      const s = getOrCreateState(sessionId);
      if (s.mode === "qr" && s.starting) {
        throw new WhatsAppClientError(
          "QR bağlantısı devam ediyor. Önce iptal edin veya tamamlanmasını bekleyin.",
          409,
          "MODE_CONFLICT",
        );
      }

      await destroyClient(sessionId);
      s.mode = "PAIRING_CODE";
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.phoneMasked = maskPhone(normalized);
      s.starting = true;
      s.lastError = null;
      setStatus(s, "PAIRING_CODE_REQUESTING", null);

      const client = await createClient(sessionId);

      // Pairing: initialize + requestPairingCode aynı instance üzerinde
      const initPromise = client.initialize().catch((err) => {
        s.starting = false;
        setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        throw err;
      });

      // requestPairingCode genelde initialize sonrası veya sırasında çağrılır
      await new Promise((r) => setTimeout(r, 1500));
      if (typeof client.requestPairingCode !== "function") {
        await destroyClient(sessionId);
        throw new WhatsAppClientError(
          "Bu whatsapp-web.js sürümünde requestPairingCode yok.",
          500,
          "PAIRING_UNSUPPORTED",
        );
      }

      try {
        const code = await client.requestPairingCode(normalized);
        s.pairingCode = String(code).replace(/\s+/g, "");
        s.qrDataUrl = null;
        setStatus(s, "PAIRING_CODE_READY", null);
        logger.info({
          sessionId,
          operation: "pairing_code_ready",
          phoneMasked: s.phoneMasked,
          clientInstanceId: s.clientInstanceId,
        }, "wa: pairing code ready");
      } catch (err) {
        s.starting = false;
        setStatus(s, "FAILED", err instanceof Error ? err.message : String(err));
        throw new WhatsAppClientError(
          err instanceof Error ? err.message : "Onay kodu alınamadı",
          500,
          "PAIRING_FAILED",
        );
      }

      void initPromise;
      return this.getStatus(sessionId);
    });
  }

  static async disconnect(sessionId = DEFAULT_SESSION_ID): Promise<void> {
    return lockFor(sessionId).runExclusive(async () => {
      await destroyClient(sessionId);
      const s = getOrCreateState(sessionId);
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      setStatus(s, "DISCONNECTED", null);
    });
  }

  /** Auth verisini sil — yalnızca kullanıcı açıkça sıfırladığında. */
  static async reset(sessionId = DEFAULT_SESSION_ID): Promise<void> {
    return lockFor(sessionId).runExclusive(async () => {
      await destroyClient(sessionId);
      const dir = sessionAuthDir(sessionId);
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        logger.warn({ err, dir }, "wa: auth dir delete failed");
      }
      const s = getOrCreateState(sessionId);
      s.starting = false;
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.mode = null;
      s.readyAt = null;
      setStatus(s, "IDLE", null);
      logger.info({ sessionId, operation: "reset", authPath: AUTH_PATH }, "wa: session reset");
    });
  }

  static async getChats(sessionId = DEFAULT_SESSION_ID): Promise<WhatsAppChatSummary[]> {
    const client = clients.get(sessionId);
    const s = getOrCreateState(sessionId);
    if (!client) throw new WhatsAppClientError("WhatsApp bağlı değil", 409, "NOT_CONNECTED");
    if (!["READY", "CONNECTED", "SYNCING"].includes(s.status)) {
      throw new WhatsAppClientError("WhatsApp henüz hazır değil", 409, "NOT_READY");
    }
    const started = Date.now();
    const chats = await Promise.race([
      client.getChats(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("getChats timeout")), 120_000)),
    ]) as Record<string, unknown>[];

    if (s.status === "CONNECTED" || s.status === "SYNCING") setStatus(s, "READY", null);

    const result: WhatsAppChatSummary[] = [];
    for (const chat of chats) {
      const { isGroup, isChannel } = classifyChat(chat);
      const id = chatIdOf(chat);
      if (!id) continue;
      result.push({
        id,
        name: chatNameOf(chat),
        isGroup,
        isChannel,
        lastMessageAt: lastMessageAtOf(chat),
      });
    }
    logger.info({
      sessionId,
      operation: "get_chats",
      messageCount: result.length,
      durationMs: Date.now() - started,
      clientInstanceId: s.clientInstanceId,
    }, "wa: getChats ok");
    return result;
  }

  static async getGroups(sessionId = DEFAULT_SESSION_ID): Promise<WhatsAppChatSummary[]> {
    const chats = await this.getChats(sessionId);
    return chats.filter((c) => c.isGroup);
  }

  static async getChatById(chatId: string, sessionId = DEFAULT_SESSION_ID) {
    const client = clients.get(sessionId);
    if (!client) throw new WhatsAppClientError("WhatsApp bağlı değil", 409, "NOT_CONNECTED");
    return client.getChatById(chatId);
  }

  static async getState(sessionId = DEFAULT_SESSION_ID): Promise<string | null> {
    const client = clients.get(sessionId);
    if (!client) return null;
    try {
      return await client.getState();
    } catch {
      return null;
    }
  }
}

// Boot helpers used by index / bot-worker
export async function initWhatsAppClient(): Promise<void> {
  await WhatsAppClientManager.init(DEFAULT_SESSION_ID);
}

export async function stopWhatsAppClient(): Promise<void> {
  await WhatsAppClientManager.disconnect(DEFAULT_SESSION_ID);
}

export function isWhatsAppReady(): boolean {
  return WhatsAppClientManager.isReady(DEFAULT_SESSION_ID);
}

export function hasWhatsAppLocalSession(): boolean {
  return WhatsAppClientManager.getStatus().hasLocalAuth;
}

export { AUTH_PATH, maskChatId };
