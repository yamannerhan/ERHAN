/** Hafif runtime doğrulama — harici zod bağımlılığı yok. */

export type StartWhatsAppInput = {
  mode?: "qr" | "pairing_code";
  phoneNumber?: string;
};

export type AddSourceInput = {
  groupId: string;
  groupName: string;
  sourceName?: string;
};

export function parseStartWhatsApp(body: unknown): { ok: true; data: StartWhatsAppInput } | { ok: false; message: string } {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const modeRaw = typeof b.mode === "string" ? b.mode.trim() : undefined;
  const phoneNumber = typeof b.phoneNumber === "string" ? b.phoneNumber.trim() : undefined;
  const mode = modeRaw === "pairing_code" || modeRaw === "qr" ? modeRaw : undefined;
  if (mode === "pairing_code" && !phoneNumber) {
    return { ok: false, message: "pairing_code için phoneNumber gerekli" };
  }
  return { ok: true, data: { mode, phoneNumber } };
}

export function parseAddSource(body: unknown): { ok: true; data: AddSourceInput } | { ok: false; message: string } {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const groupId = typeof b.groupId === "string" ? b.groupId.trim() : "";
  const groupName = typeof b.groupName === "string" ? b.groupName.trim() : "";
  const sourceName = typeof b.sourceName === "string" ? b.sourceName.trim() : undefined;
  if (!groupId || groupId.length < 3 || !groupName) {
    return { ok: false, message: "groupId ve groupName gerekli." };
  }
  return { ok: true, data: { groupId, groupName, sourceName } };
}

export function parseSaveSources(body: unknown): {
  ok: true;
  data: { groups: Array<{ groupId: string; groupName: string }> };
} | { ok: false; message: string } {
  const b = (body && typeof body === "object") ? body as Record<string, unknown> : {};
  const raw = Array.isArray(b.groups) ? b.groups : [];
  const groups: Array<{ groupId: string; groupName: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    const groupId = typeof g.groupId === "string" ? g.groupId.trim() : "";
    const groupName = typeof g.groupName === "string" ? g.groupName.trim() : "";
    if (groupId.length >= 3 && groupName) groups.push({ groupId, groupName });
  }
  if (groups.length === 0) return { ok: false, message: "En az bir grup seçin." };
  return { ok: true, data: { groups } };
}
