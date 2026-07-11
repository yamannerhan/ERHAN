/** Sohbet avatar çerçeveleri + mesaj balonu stilleri (katalog) */

export type CosmeticKind = "frame" | "bubble";

export type CosmeticDef = {
  key: string;
  kind: CosmeticKind;
  name: string;
  /** Level atlayınca otomatik hediye eşiği (yoksa sadece admin) */
  minLevel?: number;
  /** Admin özel — level ile gelmez */
  adminOnly?: boolean;
  /** Günlük sohbet hediyesi havuzunda */
  dailyPool?: boolean;
  description?: string;
};

export const AVATAR_FRAMES: CosmeticDef[] = [
  { key: "none", kind: "frame", name: "Yok" },
  { key: "bronze", kind: "frame", name: "Bronz", minLevel: 3, description: "Seviye 3 hediyesi" },
  { key: "silver", kind: "frame", name: "Gümüş", minLevel: 7 },
  { key: "gold", kind: "frame", name: "Altın", minLevel: 12 },
  { key: "emerald", kind: "frame", name: "Zümrüt", minLevel: 18 },
  { key: "neon", kind: "frame", name: "Neon", minLevel: 25 },
  { key: "fire", kind: "frame", name: "Alev", minLevel: 32 },
  { key: "rainbow", kind: "frame", name: "Gökkuşağı", minLevel: 40 },
  { key: "diamond", kind: "frame", name: "Elmas", minLevel: 50 },
  { key: "royal", kind: "frame", name: "Kraliyet", adminOnly: true },
  { key: "pulse", kind: "frame", name: "Nabız", adminOnly: true },
  { key: "galaxy", kind: "frame", name: "Galaksi", adminOnly: true },
];

export const CHAT_BUBBLES: CosmeticDef[] = [
  { key: "default", kind: "bubble", name: "Varsayılan" },
  { key: "gold", kind: "bubble", name: "Altın", minLevel: 5, dailyPool: true },
  { key: "glass", kind: "bubble", name: "Cam", minLevel: 8, dailyPool: true },
  { key: "aurora", kind: "bubble", name: "Aurora", minLevel: 14, dailyPool: true },
  { key: "neon", kind: "bubble", name: "Neon", minLevel: 20, dailyPool: true },
  { key: "fire", kind: "bubble", name: "Alev", minLevel: 28, dailyPool: true },
  { key: "ocean", kind: "bubble", name: "Okyanus", minLevel: 35, dailyPool: true },
  { key: "spark", kind: "bubble", name: "Kıvılcım", dailyPool: true, description: "Günlük sohbet hediyesi" },
  { key: "vip", kind: "bubble", name: "VIP Lüks", adminOnly: true },
  { key: "admin", kind: "bubble", name: "Yönetici", adminOnly: true },
  { key: "holo", kind: "bubble", name: "Hologram", adminOnly: true },
];

export function frameByKey(key: string | null | undefined): CosmeticDef {
  return AVATAR_FRAMES.find((f) => f.key === key) ?? AVATAR_FRAMES[0]!;
}

export function bubbleByKey(key: string | null | undefined): CosmeticDef {
  return CHAT_BUBBLES.find((b) => b.key === key) ?? CHAT_BUBBLES[0]!;
}

/** Level atlayınca verilecek en yüksek çerçeve */
export function frameGiftForLevel(level: number): string | null {
  let best: string | null = null;
  let bestLv = 0;
  for (const f of AVATAR_FRAMES) {
    if (f.adminOnly || !f.minLevel || f.key === "none") continue;
    if (level >= f.minLevel && f.minLevel >= bestLv) {
      best = f.key;
      bestLv = f.minLevel;
    }
  }
  return best;
}

/** Level atlayınca kalıcı balon hediyesi */
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

/** Günlük havuzdan seç (tarihe göre sabit) */
export function dailyBubbleKey(date = new Date()): string {
  const pool = CHAT_BUBBLES.filter((b) => b.dailyPool);
  if (pool.length === 0) return "spark";
  const day = Math.floor(date.getTime() / 86_400_000);
  return pool[day % pool.length]!.key;
}

export function isValidFrameKey(key: string): boolean {
  return AVATAR_FRAMES.some((f) => f.key === key);
}

export function isValidBubbleKey(key: string): boolean {
  return CHAT_BUBBLES.some((b) => b.key === key);
}
