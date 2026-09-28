import "dotenv/config";
import { db, sql } from "@/lib/db/client";
import { sourceSeries } from "@/db/schema";
import { getAdapter } from "@/scrapers/registry";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "validate-source" });

/**
 * `npm run validate:sources` — a lightweight, read-only sanity check
 * (Section 59) confirming every enabled `source_series` row has a
 * registered adapter and that `discoverEditions` runs without throwing.
 * Does not write to the database; useful in CI or before enabling a new
 * source in production (Section 64, step 7-8).
 */
async function main() {
  const sources = await db.select().from(sourceSeries);
  let failures = 0;

  for (const source of sources) {
    if (!source.enabled) {
      console.log(`SKIP    ${source.slug} (disabled)`);
      continue;
    }

    try {
      const adapter = getAdapter(source.adapterName);
      const editions = await adapter.discoverEditions({ now: new Date(), dryRun: true });
      console.log(`OK      ${source.slug} — ${editions.length} edition(s) discovered`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL    ${source.slug} — ${String(error)}`);
    }
  }

  await sql.end();
  if (failures > 0) {
    console.error(`\n${failures} source(s) failed validation.`);
    process.exit(1);
  }
  console.log(`\nAll enabled sources validated successfully.`);
}

main().catch(async (error) => {
  log.error("validate-source failed", { error: String(error) });
  await sql.end();
  process.exit(1);
});
