import "dotenv/config";
import { eq, or } from "drizzle-orm";
import { db, sql } from "@/lib/db/client";
import { sourceSeries } from "@/db/schema";
import { getAdapter } from "@/scrapers/registry";
import { dryRunSource } from "@/jobs/dryRun";
import { runSourceSafely } from "@/jobs/updateAllSources";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "scrape-source" });

/**
 * Section 59/60 — `npm run crawl:source -- <name>` and
 * `npm run crawl:dry-run -- <name>` both go through this one script; the
 * only difference is whether `--dry-run` is present, in which case nothing
 * is written to the database.
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sourceKey = args.find((a) => !a.startsWith("--"));

  if (!sourceKey) {
    console.error("Usage: npm run crawl:source -- <adapter-name-or-slug>  (add --dry-run for a dry run)");
    process.exit(1);
  }

  const [source] = await db
    .select()
    .from(sourceSeries)
    .where(or(eq(sourceSeries.adapterName, sourceKey), eq(sourceSeries.slug, sourceKey)))
    .limit(1);

  if (!source) {
    console.error(`No source_series found with adapter_name or slug "${sourceKey}"`);
    process.exit(1);
  }

  if (dryRun) {
    const adapter = getAdapter(source.adapterName);
    const editions = await dryRunSource(adapter, source, new Date());

    for (const edition of editions) {
      console.log(`\nSource: ${source.name}`);
      console.log(`Edition: ${edition.year} (${edition.url})`);

      const counts = { new: 0, updated: 0, unchanged: 0, duplicate_uncertain: 0 };
      for (const c of edition.challenges) counts[c.outcome] += 1;
      console.log(`\n${counts.new} new challenge${counts.new === 1 ? "" : "s"}`);
      console.log(`${counts.updated} updated`);
      console.log(`${counts.unchanged} unchanged`);
      if (counts.duplicate_uncertain > 0) {
        console.log(`${counts.duplicate_uncertain} uncertain duplicate(s) — would be preserved separately for admin review`);
      }

      for (const challenge of edition.challenges) {
        if (challenge.outcome === "new") {
          console.log(`\nNEW\n${challenge.name}\n${challenge.officialUrl}`);
        } else if (challenge.outcome === "updated") {
          console.log(`\nUPDATE\n${challenge.name}`);
          for (const change of challenge.changes) {
            console.log(`  ${change.field}:\n    old: ${JSON.stringify(change.old)}\n    new: ${JSON.stringify(change.new)}`);
          }
        } else if (challenge.outcome === "duplicate_uncertain") {
          console.log(`\nUNCERTAIN DUPLICATE\n${challenge.name} (${challenge.dedupeReason})`);
        }
      }
    }

    if (editions.every((e) => e.challenges.length === 0)) {
      console.log(`\nNo editions/challenges discovered for "${source.name}".`);
    }
  } else {
    log.info("running live crawl for single source", { source: source.slug });
    await runSourceSafely(source);
    log.info("done");
  }

  await sql.end();
}

main().catch(async (error) => {
  log.error("scrape-source failed", { error: String(error) });
  await sql.end();
  process.exit(1);
});
