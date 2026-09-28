import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { domains, taskTags, venues } from "@/db/schema";
import { slugify } from "@/lib/slug";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "taxonomy" });

export async function getVenueIdBySlug(slug: string): Promise<string | undefined> {
  const [row] = await db.select({ id: venues.id }).from(venues).where(eq(venues.slug, slug)).limit(1);
  return row?.id;
}

/**
 * Domains/task tags are a curated taxonomy (Section 9.6/9.8) — adapters
 * supply free-text names, but we only ever attach ones that already exist
 * in the seeded list, logging (not creating) anything unrecognized so the
 * taxonomy doesn't silently drift from whatever a scraper happened to say.
 */
export async function resolveDomainIds(names: string[] | undefined): Promise<string[]> {
  if (!names || names.length === 0) return [];
  const slugs = names.map(slugify);
  const rows = await db.select().from(domains).where(inArray(domains.slug, slugs));
  const foundSlugs = new Set(rows.map((r) => r.slug));
  for (const slug of slugs) {
    if (!foundSlugs.has(slug)) log.warn("unrecognized domain from adapter, skipping", { slug });
  }
  return rows.map((r) => r.id);
}

export async function resolveTaskTagIds(names: string[] | undefined): Promise<string[]> {
  if (!names || names.length === 0) return [];
  const slugs = names.map(slugify);
  const rows = await db.select().from(taskTags).where(inArray(taskTags.slug, slugs));
  const foundSlugs = new Set(rows.map((r) => r.slug));
  for (const slug of slugs) {
    if (!foundSlugs.has(slug)) log.warn("unrecognized task tag from adapter, skipping", { slug });
  }
  return rows.map((r) => r.id);
}
