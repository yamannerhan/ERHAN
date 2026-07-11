import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/** Level N için gereken toplam XP (kümülatif). Level 1 = 0 XP. */
export function xpRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  if (lv <= 1) return 0;
  // L2=100, L3=250, L4=450 … artan eğri
  let total = 0;
  for (let i = 2; i <= lv; i++) {
    total += 50 + (i - 1) * 50; // 100, 150, 200, 250…
  }
  return total;
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < 100 && xpRequiredForLevel(level + 1) <= safe) {
    level += 1;
  }
  return level;
}

export function xpProgress(xp: number, level: number): { current: number; next: number; pct: number } {
  const curFloor = xpRequiredForLevel(level);
  const nextFloor = xpRequiredForLevel(level + 1);
  const span = Math.max(1, nextFloor - curFloor);
  const into = Math.max(0, xp - curFloor);
  return { current: into, next: span, pct: Math.min(100, Math.round((into / span) * 100)) };
}

/** Level’e göre isim rengi (efektsiz, düz renk) */
export function levelNameColor(level: number): string {
  const lv = Math.max(1, level);
  if (lv >= 40) return "#F5C518"; // altın
  if (lv >= 30) return "#F97316"; // turuncu
  if (lv >= 22) return "#A855F7"; // mor
  if (lv >= 15) return "#3B82F6"; // mavi
  if (lv >= 10) return "#22C55E"; // yeşil
  if (lv >= 5) return "#2DD4BF"; // teal
  return "#94A3B8"; // slate
}

export function levelBadgeMeta(level: number): { label: string; color: string; bg: string } {
  const color = levelNameColor(level);
  return {
    label: `Lv.${level}`,
    color,
    bg: `${color}22`,
  };
}

const chatXpCooldown = new Map<number, number>();
const presenceXpCooldown = new Map<number, number>();

export async function awardChatXp(userId: number, amount = 8): Promise<{
  xp: number;
  level: number;
  leveledUp: boolean;
  giftedFrame?: string | null;
  giftedBubble?: string | null;
} | null> {
  if (userId <= 0) return null;
  const now = Date.now();
  const last = chatXpCooldown.get(userId) ?? 0;
  if (now - last < 12_000) return null;
  chatXpCooldown.set(userId, now);

  const [row] = await db.select({
    xp: usersTable.xp,
    level: usersTable.level,
    avatarFrame: usersTable.avatarFrame,
    chatBubble: usersTable.chatBubble,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!row) return null;

  const newXp = (row.xp ?? 0) + amount;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > (row.level ?? 1);

  const updates: Partial<typeof usersTable.$inferInsert> = {
    xp: newXp,
    level: newLevel,
    updatedAt: new Date(),
  };

  let giftedFrame: string | null = null;
  let giftedBubble: string | null = null;

  if (leveledUp) {
    const { frameGiftForLevel, bubbleGiftForLevel } = await import("./chat-cosmetics");
    const frame = frameGiftForLevel(newLevel);
    const bubble = bubbleGiftForLevel(newLevel);
    // Daha iyi çerçeveyi otomatik tak
    if (frame) {
      updates.avatarFrame = frame;
      giftedFrame = frame;
    }
    if (bubble) {
      // Kalıcı level balonu — süre yok
      updates.chatBubble = bubble;
      updates.chatBubbleExpiresAt = null;
      giftedBubble = bubble;
    }
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

  return { xp: newXp, level: newLevel, leveledUp, giftedFrame, giftedBubble };
}

/** İlk sohbet mesajında günlük animasyonlu balon (24 saat) — kalıcı/admin balonu ezmez */
export async function maybeGrantDailyBubble(userId: number): Promise<string | null> {
  if (userId <= 0) return null;
  const [row] = await db.select({
    chatBubble: usersTable.chatBubble,
    chatBubbleExpiresAt: usersTable.chatBubbleExpiresAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!row) return null;

  const now = new Date();
  if (row.chatBubbleExpiresAt && row.chatBubbleExpiresAt > now) return null;

  const { dailyBubbleKey, CHAT_BUBBLES } = await import("./chat-cosmetics");
  const current = CHAT_BUBBLES.find((b) => b.key === row.chatBubble);
  if (current?.adminOnly) return null;
  // Kalıcı level hediyesi (expires yok, default değil) — günlük ezmesin
  if (row.chatBubble && row.chatBubble !== "default" && !row.chatBubbleExpiresAt) return null;

  const key = dailyBubbleKey(now);
  const expires = new Date(now.getTime() + 24 * 3600 * 1000);
  await db.update(usersTable).set({
    chatBubble: key,
    chatBubbleExpiresAt: expires,
    updatedAt: now,
  }).where(eq(usersTable.id, userId));
  return key;
}

/** Sitede açık kalma — ~2 dk’da bir küçük XP */
export async function awardPresenceXp(userId: number, amount = 3): Promise<{ xp: number; level: number } | null> {
  if (userId <= 0) return null;
  const now = Date.now();
  const last = presenceXpCooldown.get(userId) ?? 0;
  if (now - last < 110_000) return null;
  presenceXpCooldown.set(userId, now);

  const [row] = await db.select({ xp: usersTable.xp, level: usersTable.level })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!row) return null;

  const newXp = (row.xp ?? 0) + amount;
  const newLevel = levelFromXp(newXp);

  await db.update(usersTable)
    .set({ xp: newXp, level: newLevel, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  return { xp: newXp, level: newLevel };
}

export async function setUserLevel(userId: number, level: number): Promise<{ xp: number; level: number } | null> {
  const lv = Math.max(1, Math.min(100, Math.floor(level)));
  const xp = xpRequiredForLevel(lv);
  const [updated] = await db.update(usersTable)
    .set({ level: lv, xp, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({ xp: usersTable.xp, level: usersTable.level });
  return updated ?? null;
}

export async function adjustUserXp(userId: number, delta: number): Promise<{ xp: number; level: number } | null> {
  const [row] = await db.select({ xp: usersTable.xp }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!row) return null;
  const newXp = Math.max(0, (row.xp ?? 0) + delta);
  const newLevel = levelFromXp(newXp);
  const [updated] = await db.update(usersTable)
    .set({ xp: newXp, level: newLevel, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({ xp: usersTable.xp, level: usersTable.level });
  return updated ?? null;
}

/** Railway’de drizzle push olmadan kolon/tablo oluştur */
export async function ensureGamificationSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
  `);
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;
  `);
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame text NOT NULL DEFAULT 'none';
  `);
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_bubble text NOT NULL DEFAULT 'default';
  `);
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_bubble_expires_at timestamptz;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS badges (
      id serial PRIMARY KEY,
      name text NOT NULL,
      slug text NOT NULL UNIQUE,
      emoji text NOT NULL DEFAULT '🏅',
      color text NOT NULL DEFAULT '#F5C518',
      description text,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_badges (
      id serial PRIMARY KEY,
      user_id integer NOT NULL,
      badge_id integer NOT NULL,
      granted_by integer,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_badges_user_badge_uidx ON user_badges (user_id, badge_id);
  `);

  // Varsayılan rozetler (tablo boşsa)
  await db.execute(sql`
    INSERT INTO badges (name, slug, emoji, color, description, sort_order)
    SELECT v.name, v.slug, v.emoji, v.color, v.description, v.sort_order
    FROM (
      VALUES
        ('Onaylı', 'onayli', '✅', '#22C55E', 'Hesabı doğrulanmış üye', 1),
        ('İşveren', 'isveren', '🏢', '#3B82F6', 'İlan veren / işveren', 2),
        ('İlan Veren', 'ilan-veren', '📋', '#A855F7', 'Aktif ilan paylaşan üye', 3)
    ) AS v(name, slug, emoji, color, description, sort_order)
    WHERE NOT EXISTS (SELECT 1 FROM badges LIMIT 1)
  `);
}
