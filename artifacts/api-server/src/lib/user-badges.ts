import { db, badgesTable, userBadgesTable } from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";

export type PublicBadge = {
  id: number;
  name: string;
  slug: string;
  emoji: string;
  color: string;
  description: string | null;
};

export async function getBadgesForUsers(userIds: number[]): Promise<Map<number, PublicBadge[]>> {
  const map = new Map<number, PublicBadge[]>();
  const ids = [...new Set(userIds.filter((id) => id > 0))];
  if (ids.length === 0) return map;

  const rows = await db
    .select({
      userId: userBadgesTable.userId,
      id: badgesTable.id,
      name: badgesTable.name,
      slug: badgesTable.slug,
      emoji: badgesTable.emoji,
      color: badgesTable.color,
      description: badgesTable.description,
    })
    .from(userBadgesTable)
    .innerJoin(badgesTable, eq(userBadgesTable.badgeId, badgesTable.id))
    .where(and(
      inArray(userBadgesTable.userId, ids),
      eq(badgesTable.isActive, true),
    ))
    .orderBy(asc(badgesTable.sortOrder), asc(badgesTable.id));

  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      slug: r.slug,
      emoji: r.emoji,
      color: r.color,
      description: r.description ?? null,
    });
    map.set(r.userId, list);
  }
  return map;
}

export async function getBadgesForUser(userId: number): Promise<PublicBadge[]> {
  const map = await getBadgesForUsers([userId]);
  return map.get(userId) ?? [];
}
