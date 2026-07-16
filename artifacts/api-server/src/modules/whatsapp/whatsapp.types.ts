export type ConnectionMode = "qr" | "pairing_code";

export type WhatsAppSessionStatus =
  | "IDLE"
  | "STARTING"
  | "QR_READY"
  | "PAIRING_READY"
  | "AUTHENTICATED"
  | "CONNECTED"
  | "SYNCING"
  | "READY"
  | "FAILED"
  | "DISCONNECTED";

export type InitialScanStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type ScanJobType =
  | "WHATSAPP_INITIAL_SCAN"
  | "WHATSAPP_INCREMENTAL_SCAN"
  | "WHATSAPP_AD_EXPIRATION";

export type ProcessResult = "published" | "skipped" | "duplicate" | "error";

export interface WhatsAppGroup {
  id: string;
  name: string;
  isGroup: boolean;
  isChannel: boolean;
  lastMessageAt: string | null;
}

export interface Checkpoint {
  messageId: string | null;
  timestamp: number | null;
}

export interface ClassifierResult {
  isJobPosting: boolean;
  confidence: number;
  reason: string;
  extractedFields: Record<string, string | null>;
}

export interface WhatsAppStatusDto {
  status: WhatsAppSessionStatus;
  connectionStatus: string;
  syncStatus: string;
  whatsappState: string | null;
  authenticated: boolean;
  ready: boolean;
  connected: boolean;
  chatCount: number;
  groupCount: number;
  syncAttempt: number;
  syncStartedAt: string | null;
  lastSyncError: string | null;
  error: string | null;
  updatedAt: string;
  starting: boolean;
  pairing: boolean;
  authAccepted: boolean;
  phase: string;
  sessionState: WhatsAppSessionStatus;
  connectionMode: ConnectionMode | null;
  mode: ConnectionMode | "qr";
  hasSession: boolean;
  volumeWarning: string | null;
  qr: string | null;
  pairingCode: string | null;
  expiresInSeconds: number | null;
  phone: string | null;
  phoneMasked: string | null;
  chromePath: string | null;
  chromiumVersion: string | null;
  browserOpen: boolean;
  pairingMethodAvailable: boolean;
  wwebjsVersion: string;
  puppeteerVersion: string;
  sessionId: string;
  clientInstanceId: string | null;
  clientPhase: WhatsAppSessionStatus;
  authPath: string;
  getChatsTimeoutMs: number;
  protocolTimeoutMs: number;
}

/** Varsayılanlar — Railway Variables zorunlu değil. */
export const SESSION_ID = process.env.WHATSAPP_SESSION_ID?.trim() || "main";
export const HISTORY_DAYS = Math.max(1, Number(process.env.WHATSAPP_HISTORY_DAYS ?? 15));
export const SCAN_INTERVAL_MS = Math.max(60_000, Number(process.env.WHATSAPP_SCAN_INTERVAL_MS ?? 10 * 60 * 1000));
export const EXPIRE_DAYS = Math.max(1, Number(process.env.WHATSAPP_EXPIRE_DAYS ?? 15));
export const FETCH_PAGE_SIZE = 50;
export const MAX_INITIAL_PAGES = 400;
export const MAX_INCREMENTAL_PAGES = 40;
export const PROTOCOL_TIMEOUT_MS = Math.max(60_000, Number(process.env.WHATSAPP_PROTOCOL_TIMEOUT_MS ?? 300_000));
export const GET_CHATS_TIMEOUT_MS = 120_000;
