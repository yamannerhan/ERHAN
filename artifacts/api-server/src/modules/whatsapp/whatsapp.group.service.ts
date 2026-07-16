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
  const client = WhatsAppManager.getClient();
  if (!client) {
    return { steps: ["client yok"], sources: [], error: "not_connected" };
  }
  try {
    const groups = await WhatsAppManager.getGroups();
    return {
      steps: ["getChats ok", `groups=${groups.length}`],
      sources: groups.map((g) => ({ id: g.id, name: g.name, kind: g.isChannel ? "channel" : "group" })),
      error: null,
    };
  } catch (err) {
    return {
      steps: [],
      sources: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
