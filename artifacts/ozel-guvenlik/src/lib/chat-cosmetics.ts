/** Frontend kopyası — frame/bubble katalog (API ile aynı anahtarlar) */

export type CosmeticDef = {
  key: string;
  kind: "frame" | "bubble";
  name: string;
  minLevel?: number;
  adminOnly?: boolean;
  dailyPool?: boolean;
  description?: string;
};

export const AVATAR_FRAMES: CosmeticDef[] = [
  { key: "none", kind: "frame", name: "Yok" },
  { key: "bronze", kind: "frame", name: "Bronz", minLevel: 3 },
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
  { key: "spark", kind: "bubble", name: "Kıvılcım", dailyPool: true },
  { key: "vip", kind: "bubble", name: "VIP Lüks", adminOnly: true },
  { key: "admin", kind: "bubble", name: "Yönetici", adminOnly: true },
  { key: "holo", kind: "bubble", name: "Hologram", adminOnly: true },
];
