/** Frontend kopyası — frame/bubble katalog */

export type CosmeticDef = {
  key: string;
  kind: "frame" | "bubble";
  name: string;
  minLevel?: number;
  adminOnly?: boolean;
  dailyPool?: boolean;
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

/** Çerçeve üzerinde gösterilecek yetki etiketi */
export function frameRoleLabel(frame: string | null | undefined, role?: string | null): string | null {
  if (frame === "admin" || role === "admin") return "YÖNETİCİ";
  if (frame === "moderator" || role === "moderator") return "MOD";
  if (frame === "vip") return "VIP";
  if (frame === "employer") return "İŞVEREN";
  return null;
}
