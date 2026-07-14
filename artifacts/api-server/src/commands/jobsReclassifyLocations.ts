#!/usr/bin/env node
/**
 * npm run jobs:reclassify-locations
 * Options: --dry-run --batch-size=100 --only-unresolved --only-low-confidence --limit=N
 */
import { reclassifyJobLocations } from "../jobs/reclassifyJobLocations";

function argNum(name: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const n = Number(a.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const onlyUnresolved = process.argv.includes("--only-unresolved");
  const onlyLowConfidence = process.argv.includes("--only-low-confidence");
  const batchSize = argNum("batch-size", 100);
  const limit = argNum("limit", 5000);

  console.log("[jobs:reclassify-locations]", { dryRun, batchSize, onlyUnresolved, onlyLowConfidence, limit });
  const result = await reclassifyJobLocations({
    dryRun,
    batchSize,
    onlyUnresolved,
    onlyLowConfidence,
    limit,
  });

  if (dryRun) {
    console.log("\n=== DRY RUN ===");
    for (const row of result.rows.slice(0, 200)) {
      console.log(
        [
          `#${row.id}`,
          `eski=${row.oldCity}`,
          `yeni=${row.newCity}`,
          `ilçe=${row.newDistrict ?? "-"}`,
          `work=${row.workLocations.join(" | ") || "-"}`,
          `servis=${row.serviceRoutes.join(" | ") || "-"}`,
          `güven=${row.confidence.toFixed(2)}`,
          `status=${row.status}`,
          `kanıt=${row.evidence[0] ?? "-"}`,
          `neden=${row.reason}`,
        ].join(" · "),
      );
    }
    if (result.rows.length > 200) console.log(`… +${result.rows.length - 200} more`);
  }

  console.log(JSON.stringify({ total: result.total, updated: result.updated, dryRun }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("[jobs:reclassify-locations] failed", e);
  process.exit(1);
});
