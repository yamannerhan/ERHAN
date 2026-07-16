/**
 * Grup/kanal keşfi — wwebjs getChats() yerine hafif Store okuma.
 * getChatModel → GroupMetadata.update tek sohbette patlayınca Promise.all tüm listeyi düşürüyor.
 */
import type { WhatsAppGroup } from "./whatsapp.types";

export type StoreProbe = {
  chatCount: number;
  groupishCount: number;
  storeReady: boolean;
  error: string | null;
};

export type RawChatSummary = {
  id: string;
  name: string;
  isGroup: boolean;
  isChannel: boolean;
  timestamp: number | null;
};

type PageLike = {
  isClosed?: () => boolean;
  evaluate?: <T>(pageFunction: string | ((...args: never[]) => T | Promise<T>), ...args: unknown[]) => Promise<T>;
};

/** Puppeteer evaluate için string — bundler bozmasın. */
const STORE_PROBE_JS = `(() => {
  try {
    const coll = window.require('WAWebCollections');
    const chats = (coll.Chat && coll.Chat.getModelsArray) ? coll.Chat.getModelsArray() : [];
    let groupish = 0;
    for (const chat of chats) {
      const id = chat.id && chat.id._serialized ? String(chat.id._serialized) : String(chat.id || '');
      if (id.endsWith('@g.us') || id.includes('@newsletter') || chat.groupMetadata || chat.isGroup) groupish++;
    }
    const news = coll.WAWebNewsletterCollection || coll.NewsletterCollection;
    const channels = (news && news.getModelsArray) ? news.getModelsArray().length : 0;
    return { chatCount: chats.length, groupishCount: groupish + channels, storeReady: !!coll.Chat, error: null };
  } catch (err) {
    return { chatCount: 0, groupishCount: 0, storeReady: false, error: String(err && err.message ? err.message : err) };
  }
})()`;

const STORE_GROUPS_JS = `(() => {
  try {
    const coll = window.require('WAWebCollections');
    const items = [];
    const chats = (coll.Chat && coll.Chat.getModelsArray) ? coll.Chat.getModelsArray() : [];
    for (const chat of chats) {
      try {
        const id = chat.id && chat.id._serialized ? String(chat.id._serialized) : String(chat.id || '');
        if (!id) continue;
        const isChannel = id.includes('@newsletter') || !!chat.isNewsletter || !!chat.newsletterMetadata;
        const isGroup = !isChannel && (id.endsWith('@g.us') || !!chat.groupMetadata || !!chat.isGroup);
        if (!isGroup && !isChannel) continue;
        const contact = chat.contact || {};
        const name = String(chat.formattedTitle || chat.name || contact.name || contact.pushname || (isChannel ? 'İsimsiz kanal' : 'İsimsiz grup'));
        const tsRaw = chat.t != null ? chat.t : chat.timestamp;
        const timestamp = typeof tsRaw === 'number' && isFinite(tsRaw) ? tsRaw : null;
        items.push({ id: id, name: name, isGroup: isGroup, isChannel: isChannel, timestamp: timestamp });
      } catch (_e) {}
    }
    const news = coll.WAWebNewsletterCollection || coll.NewsletterCollection;
    const newsletters = (news && news.getModelsArray) ? news.getModelsArray() : [];
    for (const ch of newsletters) {
      try {
        const id = ch.id && ch.id._serialized ? String(ch.id._serialized) : String(ch.id || '');
        if (!id) continue;
        if (items.some(function(x) { return x.id === id; })) continue;
        const name = String(ch.name || ch.formattedTitle || 'İsimsiz kanal');
        const tsRaw = ch.t != null ? ch.t : ch.timestamp;
        items.push({
          id: id,
          name: name,
          isGroup: false,
          isChannel: true,
          timestamp: typeof tsRaw === 'number' && isFinite(tsRaw) ? tsRaw : null
        });
      } catch (_e2) {}
    }
    return { items: items, error: null, chatCount: chats.length };
  } catch (err) {
    return { items: [], error: String(err && err.message ? err.message : err), chatCount: 0 };
  }
})()`;

export function summariesToGroups(items: RawChatSummary[]): WhatsAppGroup[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    isGroup: item.isGroup,
    isChannel: item.isChannel,
    kind: item.isChannel ? "channel" as const : "group" as const,
    lastMessageAt: item.timestamp != null ? new Date(item.timestamp * 1000).toISOString() : null,
  }));
}

export async function probeChatStore(page: PageLike | null | undefined): Promise<StoreProbe> {
  if (!page?.evaluate || page.isClosed?.()) {
    return { chatCount: 0, groupishCount: 0, storeReady: false, error: "PAGE_UNAVAILABLE" };
  }
  try {
    return await page.evaluate(STORE_PROBE_JS) as StoreProbe;
  } catch (err) {
    return {
      chatCount: 0,
      groupishCount: 0,
      storeReady: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchGroupsFromStore(page: PageLike | null | undefined): Promise<{
  groups: WhatsAppGroup[];
  chatCount: number;
  error: string | null;
}> {
  if (!page?.evaluate || page.isClosed?.()) {
    return { groups: [], chatCount: 0, error: "PAGE_UNAVAILABLE" };
  }
  try {
    const result = await page.evaluate(STORE_GROUPS_JS) as {
      items: RawChatSummary[];
      error: string | null;
      chatCount: number;
    };
    return {
      groups: summariesToGroups(result.items ?? []),
      chatCount: result.chatCount ?? 0,
      error: result.error,
    };
  } catch (err) {
    return {
      groups: [],
      chatCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type StoreMessage = {
  id?: { _serialized?: string } | string;
  timestamp?: number;
  body?: string;
  caption?: string;
};

/**
 * Mesajları Store'dan çek — getChatModel / GroupMetadata.update YOK.
 * Bağlantıyı düşüren ağır getChatById yolunu atlar.
 */
export async function fetchMessagesFromStore(
  page: PageLike | null | undefined,
  chatId: string,
  limit: number,
): Promise<{ ok: boolean; error: string | null; messages: StoreMessage[] }> {
  if (!page?.evaluate || page.isClosed?.()) {
    return { ok: false, error: "PAGE_UNAVAILABLE", messages: [] };
  }
  try {
    const result = await page.evaluate(async (id: string, wantLimit: number) => {
      const w = window as unknown as {
        WWebJS: {
          getChat: (chatId: string, opts: { getAsModel: boolean }) => Promise<{
            msgs?: { getModelsArray?: () => Array<Record<string, unknown>> };
          } | null>;
          getMessageModel: (m: Record<string, unknown>) => StoreMessage;
        };
        require: (name: string) => {
          loadEarlierMsgs: (opts: { chat: unknown }) => Promise<Array<Record<string, unknown>>>;
        };
      };
      try {
        const chat = await w.WWebJS.getChat(id, { getAsModel: false });
        if (!chat) return { ok: false, error: "CHAT_NOT_FOUND", messages: [] as StoreMessage[] };
        const filter = (m: Record<string, unknown>) => m && !m.isNotification;
        let msgs: Array<Record<string, unknown>> = [];
        try {
          msgs = chat.msgs?.getModelsArray?.()?.filter(filter) ?? [];
        } catch {
          msgs = [];
        }
        const want = Math.max(1, Number(wantLimit) || 50);
        while (msgs.length < want) {
          const loaded = await w.require("WAWebChatLoadMessages").loadEarlierMsgs({ chat });
          if (!loaded?.length) break;
          msgs = [...loaded.filter(filter), ...msgs];
        }
        if (msgs.length > want) {
          msgs.sort((a, b) => (Number(a.t) > Number(b.t) ? 1 : -1));
          msgs = msgs.splice(msgs.length - want);
        }
        const out = msgs.map((m) => {
          try {
            return w.WWebJS.getMessageModel(m);
          } catch {
            const mid = m.id as { _serialized?: string } | string | undefined;
            return {
              id: typeof mid === "object" && mid ? mid._serialized : mid,
              timestamp: Number(m.t ?? m.timestamp ?? 0) || undefined,
              body: String(m.body ?? ""),
              caption: String(m.caption ?? ""),
            } as StoreMessage;
          }
        }).filter(Boolean);
        return { ok: true, error: null, messages: out };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          messages: [] as StoreMessage[],
        };
      }
    }, chatId, limit) as { ok: boolean; error: string | null; messages: StoreMessage[] };
    return result;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      messages: [],
    };
  }
}

/** wwebjs Chat instance / plain object → grup özeti (getChats fallback). */
export function normalizeChatObjects(chats: unknown[]): WhatsAppGroup[] {
  const result: WhatsAppGroup[] = [];
  for (const raw of chats) {
    try {
      const chat = raw as Record<string, unknown>;
      const id = chat.id && typeof chat.id === "object"
        ? String((chat.id as { _serialized?: string })._serialized ?? "")
        : String(chat.id ?? "");
      if (!id) continue;
      const isChannel = id.includes("@newsletter") || Boolean(chat.isChannel) || Boolean(chat.isNewsletter);
      const isGroup = (Boolean(chat.isGroup) || id.endsWith("@g.us")) && !isChannel;
      if (!isGroup && !isChannel) continue;
      const ts = (chat.timestamp as number | undefined)
        ?? (chat.lastMessage && typeof chat.lastMessage === "object"
          ? (chat.lastMessage as { timestamp?: number }).timestamp
          : undefined);
      result.push({
        id,
        name: String(chat.name || chat.formattedTitle || chat.pushname || "İsimsiz grup"),
        isGroup,
        isChannel,
        kind: isChannel ? "channel" : "group",
        lastMessageAt: ts && Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
      });
    } catch {
      /* skip */
    }
  }
  return result;
}
