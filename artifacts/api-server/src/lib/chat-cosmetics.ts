/** Sohbet avatar çerçeveleri + mesaj balonu stilleri (katalog) */

export type CosmeticKind = "frame" | "bubble";

export type CosmeticDef = {
  key: string;
  kind: CosmeticKind;
  name: string;
  minLevel?: number;
  adminOnly?: boolean;
  dailyPool?: boolean;
  /** Role ile otomatik */
  roleAuto?: "admin" | "moderator" | "vip" | "employer";
  description?: string;
};

export const AVATAR_FRAMES: CosmeticDef[] = [
  { key: "none", kind: "frame", name: "Yok" },
  { key: "bronze", kind: "frame", name: "Bronz", minLevel: 2, dailyPool: true },
  { key: "silver", kind: "frame", name: "Gümüş", minLevel: 5, dailyPool: true },
  { key: "gold", kind: "frame", name: "Altın", minLevel: 8, dailyPool: true },
  { key: "emerald", kind: "frame", name: "Zümrüt", minLevel: 12, dailyPool: true },
  { key: "neon", kind: "frame", name: "Neon", minLevel: 16, dailyPool: true },
  { key: "fire", kind: "frame", name: "Alev", minLevel: 22, dailyPool: true },
  { key: "ocean", kind: "frame", name: "Okyanus", minLevel: 28, dailyPool: true },
  { key: "rainbow", kind: "frame", name: "Gökkuşağı", minLevel: 35, dailyPool: true },
  { key: "diamond", kind: "frame", name: "Elmas", minLevel: 45, dailyPool: true },
  { key: "galaxy", kind: "frame", name: "Galaksi", minLevel: 55, dailyPool: true },
  { key: "pulse", kind: "frame", name: "Nabız", adminOnly: true, dailyPool: true },
  { key: "royal", kind: "frame", name: "Kraliyet", adminOnly: true },
  { key: "vip", kind: "frame", name: "VIP", roleAuto: "vip", adminOnly: true },
  { key: "employer", kind: "frame", name: "İşveren", roleAuto: "employer", adminOnly: true },
  { key: "admin", kind: "frame", name: "Yönetici", roleAuto: "admin", adminOnly: true },
  { key: "moderator", kind: "frame", name: "Moderatör", roleAuto: "moderator", adminOnly: true },
];

export const CHAT_BUBBLES: CosmeticDef[] = [
  { key: "default", kind: "bubble", name: "Varsayılan", dailyPool: true },
  { key: "gold", kind: "bubble", name: "Altın", minLevel: 3, dailyPool: true },
  { key: "glass", kind: "bubble", name: "Cam", minLevel: 6, dailyPool: true },
  { key: "aurora", kind: "bubble", name: "Aurora", minLevel: 10, dailyPool: true },
  { key: "neon", kind: "bubble", name: "Neon", minLevel: 14, dailyPool: true },
  { key: "fire", kind: "bubble", name: "Alev", minLevel: 20, dailyPool: true },
  { key: "ocean", kind: "bubble", name: "Okyanus", minLevel: 26, dailyPool: true },
  { key: "spark", kind: "bubble", name: "Kıvılcım", dailyPool: true },
  { key: "holo", kind: "bubble", name: "Hologram", minLevel: 32, dailyPool: true },
  { key: "vip", kind: "bubble", name: "VIP Lüks", adminOnly: true },
  { key: "admin", kind: "bubble", name: "Yönetici", adminOnly: true },
  { key: "mod", kind: "bubble", name: "Moderatör", adminOnly: true },
];

export function frameByKey(key: string | null | undefined): CosmeticDef {
  return AVATAR_FRAMES.find((f) => f.key === key) ?? AVATAR_FRAMES[0]!;
}

export function bubbleByKey(key: string | null | undefined): CosmeticDef {
  return CHAT_BUBBLES.find((b) => b.key === key) ?? CHAT_BUBBLES[0]!;
}

export function frameGiftForLevel(level: number): string | null {
  let best: string | null = null;
  let bestLv = 0;
  for (const f of AVATAR_FRAMES) {
    if (f.adminOnly || f.roleAuto || !f.minLevel || f.key === "none") continue;
    if (level >= f.minLevel && f.minLevel >= bestLv) {
      best = f.key;
      bestLv = f.minLevel;
    }
  }
  return best;
}

export function bubbleGiftForLevel(level: number): string | null {
  let best: string | null = null;
  let bestLv = 0;
  for (const b of CHAT_BUBBLES) {
    if (b.adminOnly || !b.minLevel || b.key === "default") continue;
    if (level >= b.minLevel && b.minLevel >= bestLv) {
      best = b.key;
      bestLv = b.minLevel;
    }
  }
  return best;
}

/** Havuzdan gün/level’e göre rastgele seç */
export function pickPoolKey(
  kind: "frame" | "bubble",
  level: number,
  date = new Date(),
): string {
  const list = (kind === "frame" ? AVATAR_FRAMES : CHAT_BUBBLES).filter((c) => {
    if (c.key === "none") return false;
    if (c.roleAuto) return false;
    if (c.adminOnly && !c.dailyPool) return false;
    if (!c.dailyPool && !c.minLevel) return false;
    if (c.minLevel && level < c.minLevel) return false;
    return true;
  });
  if (list.length === 0) return kind === "frame" ? "bronze" : "spark";
  const seed = Math.floor(date.getTime() / 86_400_000) + level * 17;
  return list[seed % list.length]!.key;
}

export function dailyBubbleKey(date = new Date(), level = 1): string {
  return pickPoolKey("bubble", level, date);
}

export function dailyFrameKey(date = new Date(), level = 1): string {
  return pickPoolKey("frame", level, date);
}

/** Level’e göre hediye süresi: düşük level 1 gün, orta 7 gün, yüksek 30 gün */
export function giftDurationMs(level: number): number {
  if (level >= 30) return 30 * 24 * 3600 * 1000; // 1 ay
  if (level >= 15) return 7 * 24 * 3600 * 1000; // 1 hafta
  return 24 * 3600 * 1000; // 1 gün
}

export function isValidFrameKey(key: string): boolean {
  return AVATAR_FRAMES.some((f) => f.key === key);
}

export function isValidBubbleKey(key: string): boolean {
  return CHAT_BUBBLES.some((b) => b.key === key);
}
