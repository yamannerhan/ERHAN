import { db, newsDeletedUrlsTable } from "@workspace/db";
import { eq, or, type SQL } from "drizzle-orm";
import { ensureNewsSchema } from "./ensure";

export function normalizeNewsSourceUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.replace(/^www\./, "");
    return u.href.replace(/\/$/, "");
  } catch {
    return raw.trim().replace(/\/$/, "") || null;
  }
}

export async function rememberDeletedNewsUrl(opts: {
  sourceUrl?: string | null;
  canonicalUrl?: string | null;
  sourceHash?: string | null;
  deletedBy?: number | null;
  reason?: string;
}): Promise<void> {
  await ensureNewsSchema();
  const urls = [
    normalizeNewsSourceUrl(opts.sourceUrl),
    normalizeNewsSourceUrl(opts.canonicalUrl),
  ].filter((u): u is string => !!u);
  if (!urls.length) return;

  for (const sourceUrl of [...new Set(urls)]) {
    await db.insert(newsDeletedUrlsTable).values({
      sourceUrl,
      canonicalUrl: normalizeNewsSourceUrl(opts.canonicalUrl),
      sourceHash: opts.sourceHash || null,
      deletedBy: opts.deletedBy ?? null,
      reason: opts.reason || "admin_delete",
    }).onConflictDoNothing();
  }
}

export async function isNewsUrlBlocked(
  sourceUrl?: string | null,
  canonicalUrl?: string | null,
): Promise<boolean> {
  await ensureNewsSchema();
  const a = normalizeNewsSourceUrl(sourceUrl);
  const b = normalizeNewsSourceUrl(canonicalUrl);
  const conditions: SQL[] = [];
  if (a) {
    conditions.push(eq(newsDeletedUrlsTable.sourceUrl, a));
    conditions.push(eq(newsDeletedUrlsTable.canonicalUrl, a));
  }
  if (b && b !== a) {
    conditions.push(eq(newsDeletedUrlsTable.sourceUrl, b));
    conditions.push(eq(newsDeletedUrlsTable.canonicalUrl, b));
  }
  if (!conditions.length) return false;
  const [row] = await db.select({ id: newsDeletedUrlsTable.id })
    .from(newsDeletedUrlsTable)
    .where(or(...conditions))
    .limit(1);
  return !!row;
}
