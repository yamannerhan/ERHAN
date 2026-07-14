#!/usr/bin/env node
/**
 * npm run locations:sync
 * Geofabrik Türkiye PBF indir + konum upsert + 81 il doğrulama
 */
import { runLocationsSync } from "../jobs/runLocationsSync";

async function main() {
  const force = process.argv.includes("--force");
  const skipPbf = process.argv.includes("--bootstrap-only");
  console.log("[locations:sync] starting…");
  const report = await runLocationsSync({ forceDownload: force, skipPbf });
  console.log(JSON.stringify(report, null, 2));
  if (report.provinces !== 81 && !skipPbf) {
    console.warn("[locations:sync] province count is not 81 — review required");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[locations:sync] failed", e);
  process.exit(1);
});
