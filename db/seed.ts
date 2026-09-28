import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, sql } from "@/lib/db/client";
import { domains, sourceSeries, taskTags, venues } from "@/db/schema";
import { DOMAINS, SOURCE_SERIES, TASK_TAGS, VENUES, venueSlug } from "@/db/seedData";
import { slugify } from "@/lib/slug";
import { logger } from "@/lib/logger";

/**
 * Idempotent seed for the curated taxonomy (venues, domains, task tags) and
 * the Section 33/34 source registry. Safe to re-run — every insert is
 * conflict-guarded on the natural unique key, so re-seeding never duplicates
 * or clobbers rows a crawl run has since updated (e.g. source_series health
 * fields), aside from the handful of registry fields this script owns.
 */
async function seedVenues(): Promise<Map<string, string>> {
  const idBySlug = new Map<string, string>();
  for (const venue of VENUES) {
    const slug = venueSlug(venue.name);
    const [row] = await db
      .insert(venues)
      .values({ name: venue.name, slug, shortName: venue.shortName, homepageUrl: venue.homepageUrl })
      .onConflictDoUpdate({
        target: venues.slug,
        set: { name: venue.name, shortName: venue.shortName, homepageUrl: venue.homepageUrl },
      })
      .returning({ id: venues.id, slug: venues.slug });
    idBySlug.set(row.slug, row.id);
  }
  logger.info("seeded venues", { count: VENUES.length });
  return idBySlug;
}

async function seedDomains() {
  for (const name of DOMAINS) {
    await db
      .insert(domains)
      .values({ name, slug: slugify(name) })
      .onConflictDoNothing({ target: domains.slug });
  }
  logger.info("seeded domains", { count: DOMAINS.length });
}

async function seedTaskTags() {
  for (const name of TASK_TAGS) {
    await db
      .insert(taskTags)
      .values({ name, slug: slugify(name) })
      .onConflictDoNothing({ target: taskTags.slug });
  }
  logger.info("seeded task tags", { count: TASK_TAGS.length });
}

async function seedSourceSeries(venueIdBySlug: Map<string, string>) {
  for (const source of SOURCE_SERIES) {
    const slug = slugify(source.name);
    const venueId = venueIdBySlug.get(venueSlug(source.venueName));
    const existing = await db.select().from(sourceSeries).where(eq(sourceSeries.slug, slug)).limit(1);

    if (existing.length > 0) {
      // Never clobber crawl-health fields (last_checked_at, etc.) on re-seed;
      // only the registry metadata this script owns.
      await db
        .update(sourceSeries)
        .set({ name: source.name, venueId, adapterName: source.adapterName, rootUrl: source.rootUrl, discoveryStrategy: source.discoveryStrategy })
        .where(eq(sourceSeries.slug, slug));
    } else {
      await db.insert(sourceSeries).values({
        name: source.name,
        slug,
        venueId,
        adapterName: source.adapterName,
        rootUrl: source.rootUrl,
        enabled: source.enabled,
        discoveryStrategy: source.discoveryStrategy,
        configJson: { priority: source.priority },
      });
    }
  }
  logger.info("seeded source series", { count: SOURCE_SERIES.length });
}

async function main() {
  const venueIdBySlug = await seedVenues();
  await seedDomains();
  await seedTaskTags();
  await seedSourceSeries(venueIdBySlug);
  await sql.end();
}

main().catch((error) => {
  logger.error("seed failed", { error: String(error) });
  process.exit(1);
});
