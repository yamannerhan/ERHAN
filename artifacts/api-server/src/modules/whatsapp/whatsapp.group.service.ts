import { WhatsAppManager } from "./whatsapp.manager";
import {
  disableSource,
  listSourcesForAdmin,
  resetAllSources,
  resetSource,
  upsertSource,
} from "./whatsapp.repository";
import type { WhatsAppGroup } from "./whatsapp.types";

export async function listWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  return WhatsAppManager.getGroups();
}

export async function listWhatsAppGroupsSafe(): Promise<WhatsAppGroup[]> {
  try {
    return await WhatsAppManager.getGroups();
  } catch {
    return [];
  }
}

export async function addWhatsAppGroupSource(params: {
  groupId: string;
  groupName: string;
  sourceName?: string;
}) {
  return upsertSource({
    chatId: params.groupId,
    chatName: (params.sourceName || params.groupName).slice(0, 120),
  });
}

/** Admin panelinden seçilen grupları kaydet — otomatik seçim yok. */
export async function saveSelectedGroups(groups: Array<{ groupId: string; groupName: string }>) {
  const results = [];
  for (const g of groups) {
    results.push(await upsertSource({
      chatId: g.groupId,
      chatName: g.groupName.slice(0, 120),
    }));
  }
  return results;
}

export async function listWhatsAppSourcesForAdmin() {
  return listSourcesForAdmin();
}

export async function disableWhatsAppSource(id: number) {
  return disableSource(id);
}

export async function resetWhatsAppSource(id: number) {
  return resetSource(id);
}

export async function resetAllWhatsAppSources() {
  return resetAllSources();
}

export async function getDiscoveryDiagnostics() {
  const status = WhatsAppManager.getStatus();
  const client = WhatsAppManager.getActiveClient();

  if (!client) {
    return {
      steps: status.starting
        ? ["WhatsApp client başlatılıyor; henüz hazır değil.", `connectionStatus=${status.connectionStatus}`]
        : ["WhatsApp client henüz oluşturulmadı. Önce bağlanın."],
      sources: [] as Array<{ id: string; name: string; kind: string }>,
      error: status.starting ? null : "CLIENT_NOT_READY",
    };
  }

  const cached = WhatsAppManager.getCachedGroups();
  const baseSteps = [
    `managerInstanceId=${WhatsAppManager.managerInstanceId}`,
    `clientInstanceId=${status.clientInstanceId}`,
    `connectionStatus=${status.connectionStatus}`,
    `groupDiscoveryStatus=${status.groupDiscoveryStatus}`,
    `chats=${status.chatCount}`,
    `groups=${status.groupCount}`,
    `channels=${status.channelCount}`,
  ];

  if (status.groupDiscoveryStatus === "READY" && cached.length > 0) {
    return {
      steps: [
        ...baseSteps,
        `cachedGroups=${cached.length}`,
      ],
      sources: cached.map((g) => ({
        id: g.id,
        name: g.name,
        kind: g.isChannel ? "channel" : "group",
      })),
      error: null as string | null,
    };
  }

  return {
    steps: [
      ...baseSteps,
      status.groupDiscoveryMessage ?? "Keşif sürüyor",
    ],
    sources: cached.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.isChannel ? "channel" : "group",
    })),
    error: status.groupDiscoveryStatus === "FAILED" ? status.groupDiscoveryMessage : null,
  };
}
