import { and, eq, gte, lt, sql as rawSql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { challenges } from "@/db/schema";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "reconcileStaleRecords" });

const STALE_DAYS = 30;
const REVIEW_DAYS = 90;

/**
 * Section 19 — Deletion Policy. Never hard-deletes a challenge because a
 * crawl stopped seeing it upstream (broken adapter, site redesign, page
 * moved, or a genuinely archived challenge are all indistinguishable from
 * here). Staleness is derived from `last_seen_at` at query/report time
 * rather than a stored flag — this job just reports it (Section 40
 * observability) so an admin can decide whether to hide/archive.
 */
export async function reconcileStaleRecords() {
  const now = Date.now();
  const staleSince = new Date(now - STALE_DAYS * 86400000);
  const reviewSince = new Date(now - REVIEW_DAYS * 86400000);

  const staleCount = await db
    .select({ count: rawSql<number>`count(*)` })
    .from(challenges)
    .where(and(eq(challenges.isActive, true), lt(challenges.lastSeenAt, staleSince), gte(challenges.lastSeenAt, reviewSince)));

  const needsReview = await db
    .select({ id: challenges.id, slug: challenges.slug, name: challenges.name, lastSeenAt: challenges.lastSeenAt })
    .from(challenges)
    .where(and(eq(challenges.isActive, true), lt(challenges.lastSeenAt, reviewSince)));

  log.info("stale record reconciliation", {
    staleCount: staleCount[0]?.count ?? 0,
    needsReviewCount: needsReview.length,
  });

  for (const challenge of needsReview) {
    log.warn("challenge not seen by any crawl in 90+ days; needs admin review", {
      slug: challenge.slug,
      name: challenge.name,
      lastSeenAt: challenge.lastSeenAt,
    });
  }

  return { staleCount: staleCount[0]?.count ?? 0, needsReview };
}
