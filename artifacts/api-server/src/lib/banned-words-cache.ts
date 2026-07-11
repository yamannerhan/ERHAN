import { db, bannedWordsTable } from "@workspace/db";

let cache: { words: string[]; at: number } | null = null;
const TTL_MS = 60_000;

export function invalidateBannedWordsCache(): void {
  cache = null;
}

export async function getExtraBannedWords(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.words;
  try {
    const rows = await db.select({ word: bannedWordsTable.word }).from(bannedWordsTable);
    cache = { words: rows.map((r) => r.word).filter(Boolean), at: Date.now() };
    return cache.words;
  } catch {
    return cache?.words ?? [];
  }
}
