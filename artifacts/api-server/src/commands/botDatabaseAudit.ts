import { pool } from "@workspace/db";

async function duplicateGroups(groupQuery: string): Promise<number> {
  const result = await pool.query<{ groups: number }>(
    `SELECT count(*)::int AS groups FROM (${groupQuery}) duplicate_groups`,
  );
  return result.rows[0]?.groups ?? 0;
}

try {
  const report = {
    importedPostHashGroups: await duplicateGroups(
      "SELECT duplicate_hash FROM imported_posts GROUP BY duplicate_hash HAVING count(*) > 1",
    ),
    importedPostExternalIdGroups: await duplicateGroups(
      "SELECT source_id, external_id FROM imported_posts GROUP BY source_id, external_id HAVING count(*) > 1",
    ),
    listingMessageIdGroups: await duplicateGroups(
      "SELECT source_id, message_id FROM listings WHERE source_id IS NOT NULL AND message_id IS NOT NULL GROUP BY source_id, message_id HAVING count(*) > 1",
    ),
    pendingImportedPostGroups: await duplicateGroups(
      "SELECT imported_post_id FROM pending_jobs WHERE imported_post_id IS NOT NULL GROUP BY imported_post_id HAVING count(*) > 1",
    ),
    sourcePlatformUrlGroups: await duplicateGroups(
      "SELECT platform, url FROM sources GROUP BY platform, url HAVING count(*) > 1",
    ),
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await pool.end();
}
