export type ConnectionMode = "qr" | "PAIRING_CODE";

export type WhatsAppSessionStatus =
  | "IDLE"
  | "STARTING"
  | "QR_READY"
  | "PAIRING_CODE_REQUESTING"
  | "PAIRING_CODE_READY"
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
  | "failed"
  | "paused";

export type ScanJobType =
  | "WHATSAPP_INITIAL_SCAN"
  | "WHATSAPP_INCREMENTAL_SCAN"
  | "WHATSAPP_AD_EXPIRATION";

export type ScanJobStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING";

export type ProcessMessageResult =
  | "published"
  | "skipped"
  | "duplicate"
  | "error";

export interface WhatsAppChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  isChannel: boolean;
  lastMessageAt: string | null;
}

export interface ClassifierResult {
  isJobPosting: boolean;
  confidence: number;
  reason: string;
  extractedFields: Record<string, string | null>;
}

export interface Checkpoint {
  messageId: string | null;
  timestamp: number | null;
}

export const DEFAULT_SESSION_ID = "default";
export const INITIAL_SCAN_DAYS = 15;
export const LISTING_TTL_DAYS = 15;
export const INCREMENTAL_CRON_MS = 10 * 60 * 1000;
export const FETCH_PAGE_SIZE = 50;
export const MAX_INITIAL_PAGES = 400;
export const MAX_INCREMENTAL_PAGES = 40;
