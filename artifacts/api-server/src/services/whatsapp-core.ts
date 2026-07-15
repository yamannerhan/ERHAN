export type WhatsAppSourceKind = "group" | "channel";

export interface WhatsAppDiscoveredSource {
  id: string;
  name: string;
  participants: number;
  kind: WhatsAppSourceKind;
}

export interface WhatsAppDiscoveryClient {
  getChats: () => Promise<unknown[]>;
  getChannels?: () => Promise<unknown[]>;
}

export interface WhatsAppDiscoveryResult {
  sources: WhatsAppDiscoveredSource[];
  chatCount: number;
  groupCount: number;
  channelCount: number;
  errors: string[];
  steps: string[];
}

export interface WhatsAppMessageLike {
  id?: unknown;
  timestamp?: unknown;
  body?: unknown;
  caption?: unknown;
  _data?: {
    id?: unknown;
    body?: unknown;
    caption?: unknown;
  };
  __x_body?: unknown;
  content?: unknown;
  textData?: { text?: unknown };
  list?: { description?: unknown };
  hydratedButtonsMessage?: { contentText?: unknown };
  text?: unknown;
}

export interface WhatsAppChatLike {
  fetchMessages: (options: { limit: number }) => Promise<WhatsAppMessageLike[]>;
  syncHistory?: () => Promise<unknown>;
}

export interface WhatsAppCoreMessage {
  id: string;
  remoteJid: string;
  text: string;
  timestamp: number;
}

export interface WhatsAppMessageFetchResult {
  messages: WhatsAppCoreMessage[];
  oldestTs: number;
  reachedCutoff: boolean;
  historyExhausted: boolean;
  rounds: number;
  diagnostics: string[];
}

export interface SelectableWhatsAppSource {
  id: number;
  active: boolean;
  platform: string;
}

function errorDetail(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`.slice(0, 1_500);
  }
  return String(error).slice(0, 1_500);
}

function serializedId(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return String(record["_serialized"] ?? record["serialized"] ?? "").trim();
}

function sourceId(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const record = raw as Record<string, unknown>;
  return serializedId(record["id"]) || String(record["serialized"] ?? "").trim();
}

function sourceName(raw: unknown, id: string): string {
  if (!raw || typeof raw !== "object") return id;
  const record = raw as Record<string, unknown>;
  return String(record["name"] ?? record["formattedTitle"] ?? record["title"] ?? id).trim() || id;
}

function sourceParticipants(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const record = raw as Record<string, any>;
  return Number(
    record["participants"]?.length
    ?? record["groupMetadata"]?.participants?.length
    ?? record["subscribersCount"]
    ?? 0,
  ) || 0;
}

function addDiscoveredSource(
  byId: Map<string, WhatsAppDiscoveredSource>,
  raw: unknown,
  forcedKind?: WhatsAppSourceKind,
): void {
  const id = sourceId(raw);
  if (!id) return;
  const record = raw as Record<string, unknown>;
  const isChannel = forcedKind === "channel"
    || record["isChannel"] === true
    || record["isNewsletter"] === true
    || id.endsWith("@newsletter");
  const isGroup = forcedKind === "group" || record["isGroup"] === true || id.endsWith("@g.us");
  if (!isChannel && !isGroup) return;
  byId.set(id, {
    id,
    name: sourceName(raw, id),
    participants: sourceParticipants(raw),
    kind: isChannel ? "channel" : "group",
  });
}

/**
 * Yalnız whatsapp-web.js kararlı genel API'lerini kullanır.
 * getChats ve getChannels birbirinden bağımsızdır; biri hata verse diğeri çalışır.
 */
export async function discoverWhatsAppSources(
  client: WhatsAppDiscoveryClient,
): Promise<WhatsAppDiscoveryResult> {
  const byId = new Map<string, WhatsAppDiscoveredSource>();
  const errors: string[] = [];
  const steps: string[] = [];
  let chatCount = 0;

  try {
    const chats = await client.getChats();
    chatCount = chats.length;
    for (const chat of chats) addDiscoveredSource(byId, chat);
    steps.push(`getChats: ${chatCount} sohbet`);
  } catch (error) {
    errors.push(`getChats hatası: ${errorDetail(error)}`);
  }

  if (typeof client.getChannels === "function") {
    try {
      const channels = await client.getChannels();
      for (const channel of channels) addDiscoveredSource(byId, channel, "channel");
      steps.push(`getChannels: ${channels.length} kanal`);
    } catch (error) {
      errors.push(`getChannels hatası: ${errorDetail(error)}`);
    }
  } else {
    steps.push("getChannels: bu whatsapp-web.js sürümünde yok");
  }

  const sources = [...byId.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "group" ? -1 : 1;
    return a.name.localeCompare(b.name, "tr");
  });
  return {
    sources,
    chatCount,
    groupCount: sources.filter((source) => source.kind === "group").length,
    channelCount: sources.filter((source) => source.kind === "channel").length,
    errors,
    steps,
  };
}

export function extractWhatsAppMessageText(message: WhatsAppMessageLike): string {
  const candidates = [
    message.body,
    message.caption,
    message._data?.body,
    message._data?.caption,
    message.__x_body,
    message.content,
    message.textData?.text,
    message.list?.description,
    message.hydratedButtonsMessage?.contentText,
    message.text,
  ];
  for (const candidate of candidates) {
    const text = candidate == null ? "" : String(candidate).trim();
    if (text) return text;
  }
  return "";
}

function messageId(message: WhatsAppMessageLike): string {
  return serializedId(message.id)
    || (typeof message.id === "string" ? message.id.trim() : "")
    || serializedId(message._data?.id);
}

function timestampMs(value: unknown): number {
  const timestamp = Number(value ?? 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp < 1e12 ? Math.round(timestamp * 1000) : Math.round(timestamp);
}

/**
 * Mesajları yalnız Chat.fetchMessages/syncHistory ile çeker.
 * Deep modunda limit kademeli büyür; sabit sleep veya dahili Store API'si yoktur.
 */
export async function fetchMessagesFromChat(
  chat: WhatsAppChatLike,
  remoteJid: string,
  options: {
    cutoff: number;
    deep?: boolean;
    limit?: number;
    maxLimit?: number;
    onProgress?: (progress: { round: number; maxRounds: number; messages: number; oldestTs: number }) => void | Promise<void>;
  },
): Promise<WhatsAppMessageFetchResult> {
  const diagnostics: string[] = [];
  const byId = new Map<string, WhatsAppCoreMessage>();
  const firstLimit = Math.max(1, Math.min(options.limit ?? (options.deep ? 500 : 200), 5_000));
  const maxLimit = Math.max(firstLimit, Math.min(options.maxLimit ?? (options.deep ? 5_000 : firstLimit), 10_000));
  const limits: number[] = [];
  for (let limit = firstLimit; limit <= maxLimit; limit += firstLimit) limits.push(limit);
  if (limits[limits.length - 1] !== maxLimit) limits.push(maxLimit);

  if (typeof chat.syncHistory === "function") {
    try {
      await chat.syncHistory();
    } catch (error) {
      diagnostics.push(`syncHistory hatası: ${errorDetail(error)}`);
    }
  }

  let rounds = 0;
  let historyExhausted = false;
  let reachedCutoff = false;
  let previousSize = -1;

  for (const limit of limits) {
    rounds++;
    let batch: WhatsAppMessageLike[];
    try {
      batch = (await chat.fetchMessages({ limit })) ?? [];
    } catch (error) {
      diagnostics.push(`fetchMessages hatası: ${errorDetail(error)}`);
      break;
    }

    let batchReachedCutoff = false;
    for (const message of batch) {
      const id = messageId(message);
      const timestamp = timestampMs(message.timestamp);
      const text = extractWhatsAppMessageText(message);
      if (timestamp > 0 && timestamp <= options.cutoff) batchReachedCutoff = true;
      if (!id || !timestamp || timestamp <= options.cutoff || text.length < 4) continue;
      byId.set(id, { id, remoteJid, text, timestamp });
    }

    const oldestTs = [...byId.values()].reduce((oldest, message) => Math.min(oldest, message.timestamp), Date.now());
    reachedCutoff = reachedCutoff || batchReachedCutoff;
    if (options.onProgress) {
      await options.onProgress({ round: rounds, maxRounds: limits.length, messages: byId.size, oldestTs });
    }
    const noGrowth = byId.size === previousSize;
    previousSize = byId.size;
    if (!options.deep || reachedCutoff || batch.length < limit || noGrowth) {
      historyExhausted = !reachedCutoff;
      break;
    }
  }

  const messages = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  return {
    messages,
    oldestTs: messages[0]?.timestamp ?? Date.now(),
    reachedCutoff,
    historyExhausted: historyExhausted || messages.length === 0 || rounds >= limits.length,
    rounds,
    diagnostics,
  };
}

export function selectedWhatsAppSources<T extends SelectableWhatsAppSource>(sources: T[]): T[] {
  return sources.filter((source) => source.platform === "whatsapp" && source.active);
}

/**
 * Bir kaynaktaki hata sonraki seçili kaynağı durdurmaz.
 */
export async function scanSelectedWhatsAppSources<T extends SelectableWhatsAppSource>(
  sources: T[],
  scan: (source: T) => Promise<void>,
): Promise<Array<{ sourceId: number; error: string }>> {
  const errors: Array<{ sourceId: number; error: string }> = [];
  for (const source of selectedWhatsAppSources(sources)) {
    try {
      await scan(source);
    } catch (error) {
      errors.push({ sourceId: source.id, error: errorDetail(error) });
    }
  }
  return errors;
}
