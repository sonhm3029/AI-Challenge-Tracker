import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  challengeDomains,
  challengeLinks,
  challenges,
  challengeSourceRecords,
  challengeTaskTags,
  crawlRuns,
  sourceEditions,
  sourceSeries,
} from "@/db/schema";
import type { ChallengeSourceAdapter, CrawlContext, ScrapedChallenge, SourceEditionCandidate } from "@/scrapers/types";
import { normalizeScrapedChallenge, type NormalizedChallenge } from "@/lib/normalize";
import { hashScrapedChallenge } from "@/lib/contentHash";
import { findExistingChallenge } from "@/lib/dedupe";
import { buildChallengeSlug } from "@/lib/slug";
import { getFieldOverrides, stripOverriddenFields } from "@/lib/overrides";
import { getVenueIdBySlug, resolveDomainIds, resolveTaskTagIds } from "@/lib/taxonomy";
import { buildProposedChallengeFields } from "@/lib/challengeFields";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "updateSource" });

export type SourceSeriesRow = typeof sourceSeries.$inferSelect;

export type RecordOutcome = "insert" | "update" | "unchanged" | "duplicate_uncertain" | "failed";

export type ProcessedRecord = {
  outcome: RecordOutcome;
  challengeId?: string;
  name: string;
  officialUrl: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  error?: string;
};

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  // Small table (Section 58: <10,000 challenges) — a loop is simpler and
  // plenty fast; no need for a clever single-query uniqueness scheme.
  for (;;) {
    const [existing] = await db.select({ id: challenges.id }).from(challenges).where(eq(challenges.slug, candidate)).limit(1);
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function upsertChallengeLinks(challengeId: string, scraped: NormalizedChallenge) {
  const linkRows = [
    { label: "Official website", type: "official" as const, url: scraped.officialUrl, isPrimary: true },
    ...(scraped.links ?? []),
  ];

  const existing = await db.select().from(challengeLinks).where(eq(challengeLinks.challengeId, challengeId));
  const existingUrls = new Set(existing.map((l) => l.url));

  for (const link of linkRows) {
    const url = normalizeUrl(link.url, scraped.officialUrl);
    if (existingUrls.has(url)) continue;
    await db.insert(challengeLinks).values({
      challengeId,
      label: link.label,
      url,
      linkType: "type" in link ? link.type : "official",
      isPrimary: "isPrimary" in link ? Boolean(link.isPrimary) : false,
    });
    existingUrls.add(url);
  }
}

async function upsertChallengeTaxonomy(challengeId: string, scraped: NormalizedChallenge) {
  const domainIds = await resolveDomainIds(scraped.domains);
  const existingDomains = await db.select().from(challengeDomains).where(eq(challengeDomains.challengeId, challengeId));
  const existingDomainIds = new Set(existingDomains.map((d) => d.domainId));
  for (const domainId of domainIds) {
    if (!existingDomainIds.has(domainId)) {
      await db.insert(challengeDomains).values({ challengeId, domainId }).onConflictDoNothing();
    }
  }

  const taskTagIds = await resolveTaskTagIds(scraped.taskTags);
  const existingTags = await db.select().from(challengeTaskTags).where(eq(challengeTaskTags.challengeId, challengeId));
  const existingTagIds = new Set(existingTags.map((t) => t.taskTagId));
  for (const taskTagId of taskTagIds) {
    if (!existingTagIds.has(taskTagId)) {
      await db.insert(challengeTaskTags).values({ challengeId, taskTagId }).onConflictDoNothing();
    }
  }
}

async function upsertSourceRecord(params: {
  challengeId: string;
  sourceSeriesId: string;
  sourceEditionId: string;
  scraped: NormalizedChallenge;
  contentHash: string;
}) {
  const { challengeId, sourceSeriesId, sourceEditionId, scraped, contentHash } = params;
  const [existing] = await db
    .select()
    .from(challengeSourceRecords)
    .where(and(eq(challengeSourceRecords.challengeId, challengeId), eq(challengeSourceRecords.sourceUrl, scraped.sourceUrl)))
    .limit(1);

  if (existing) {
    await db
      .update(challengeSourceRecords)
      .set({
        sourceEditionId,
        externalKey: scraped.externalKey,
        rawTitle: scraped.name,
        rawPayloadJson: (scraped.rawPayload ?? scraped) as never,
        contentHash,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(challengeSourceRecords.id, existing.id));
    return existing.contentHash;
  }

  await db.insert(challengeSourceRecords).values({
    challengeId,
    sourceSeriesId,
    sourceEditionId,
    sourceUrl: scraped.sourceUrl,
    externalKey: scraped.externalKey,
    rawTitle: scraped.name,
    rawPayloadJson: (scraped.rawPayload ?? scraped) as never,
    contentHash,
  });
  return null;
}

/**
 * Section 18 — Upsert Semantics. Processes a single scraped challenge:
 * dedupe match → insert / update / unchanged / preserve-as-duplicate, always
 * respecting field_overrides (Section 9.11) and never deleting anything.
 */
export async function processScrapedChallenge(params: {
  raw: ScrapedChallenge;
  sourceSeries: SourceSeriesRow;
  sourceEditionId: string;
}): Promise<ProcessedRecord> {
  const { raw, sourceSeries, sourceEditionId } = params;
  const scraped = normalizeScrapedChallenge(raw);
  const contentHash = hashScrapedChallenge(scraped);

  const venueId = scraped.venueSlug ? await getVenueIdBySlug(scraped.venueSlug) : undefined;

  const dedupe = await findExistingChallenge(sourceSeries.id, {
    externalKey: scraped.externalKey,
    name: scraped.name,
    officialUrl: scraped.officialUrl,
    venueId: venueId ?? null,
    venueYear: scraped.venueYear ?? null,
  });

  const proposedFields: Record<string, unknown> = {
    ...buildProposedChallengeFields(scraped, venueId),
    sourceEditionId,
  };

  const now = new Date();

  if (!dedupe.autoMerge || !dedupe.challenge) {
    // "none" -> genuinely new challenge. "uncertain_domain_year" -> Section
    // 17: never auto-merge a low-confidence match; preserve separately for
    // admin review instead of silently creating a duplicate merge risk.
    const baseSlug = buildChallengeSlug(scraped.name, scraped.venueYear);
    const slug = await ensureUniqueSlug(baseSlug);

    const [inserted] = await db
      .insert(challenges)
      .values({
        slug,
        ...proposedFields,
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
        isManuallyCreated: false,
      } as never)
      .returning({ id: challenges.id });

    await upsertChallengeLinks(inserted.id, scraped);
    await upsertChallengeTaxonomy(inserted.id, scraped);
    await upsertSourceRecord({ challengeId: inserted.id, sourceSeriesId: sourceSeries.id, sourceEditionId, scraped, contentHash });

    if (dedupe.kind === "uncertain_domain_year") {
      log.warn("preserved likely-duplicate challenge for admin review", {
        newChallengeId: inserted.id,
        candidateChallengeId: dedupe.challenge?.id,
        reason: dedupe.reason,
      });
    }

    return { outcome: "insert", challengeId: inserted.id, name: scraped.name, officialUrl: scraped.officialUrl };
  }

  // High-confidence match: update the existing challenge.
  const existing = dedupe.challenge;
  const overrides = await getFieldOverrides(existing.id);
  const previousHash = await upsertSourceRecord({
    challengeId: existing.id,
    sourceSeriesId: sourceSeries.id,
    sourceEditionId,
    scraped,
    contentHash,
  });

  await upsertChallengeLinks(existing.id, scraped);
  await upsertChallengeTaxonomy(existing.id, scraped);

  if (previousHash === contentHash) {
    // Content hasn't changed, but status is time-derived (Section 15): a
    // challenge can move open -> evaluation -> closed purely because the
    // clock advanced, with none of its scraped fields changing. Recompute
    // and persist just that one field (skipping it if manually overridden)
    // so status doesn't freeze at whatever it was on first insert.
    const statusUpdate: Record<string, unknown> = {};
    if (!("status" in overrides) && proposedFields.status !== existing.status) {
      statusUpdate.status = proposedFields.status;
    }

    await db
      .update(challenges)
      .set({ ...statusUpdate, lastSeenAt: now, lastVerifiedAt: now, updatedAt: now } as never)
      .where(eq(challenges.id, existing.id));
    return { outcome: "unchanged", challengeId: existing.id, name: scraped.name, officialUrl: scraped.officialUrl };
  }

  const updateFields = stripOverriddenFields(proposedFields, overrides);
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const [field, newValue] of Object.entries(updateFields)) {
    const oldValue = (existing as unknown as Record<string, unknown>)[field];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }

  await db
    .update(challenges)
    .set({ ...updateFields, lastSeenAt: now, lastVerifiedAt: now, updatedAt: now } as never)
    .where(eq(challenges.id, existing.id));

  return { outcome: "update", challengeId: existing.id, name: scraped.name, officialUrl: scraped.officialUrl, changes };
}

export async function persistEdition(sourceSeriesId: string, candidate: SourceEditionCandidate): Promise<string> {
  const [existing] = await db
    .select()
    .from(sourceEditions)
    .where(and(eq(sourceEditions.sourceSeriesId, sourceSeriesId), eq(sourceEditions.year, candidate.year)))
    .limit(1);

  const now = new Date();
  if (existing) {
    await db
      .update(sourceEditions)
      .set({ url: candidate.url, lastSeenAt: now, lastCheckedAt: now, updatedAt: now })
      .where(eq(sourceEditions.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(sourceEditions)
    .values({ sourceSeriesId, year: candidate.year, url: candidate.url, firstSeenAt: now, lastSeenAt: now, lastCheckedAt: now })
    .returning({ id: sourceEditions.id });
  return inserted.id;
}

export type SourceRunSummary = {
  editionsDiscovered: number;
  recordsParsed: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsUnchanged: number;
  recordsFailed: number;
  records: ProcessedRecord[];
};

/**
 * Section 20 — runs one source end to end. Callers decide whether to
 * persist (see jobs/updateAllSources.ts) vs. just report (dry run, see
 * scripts/scrape-source.ts) by choosing whether to call this at all inside
 * a DB-writing context; this function itself always writes when it runs,
 * so dry-run mode must call plan-only helpers instead (see dryRunSource).
 */
export async function runSourceEditions(
  adapter: ChallengeSourceAdapter,
  sourceSeries: SourceSeriesRow,
  context: CrawlContext,
): Promise<SourceRunSummary> {
  const editions = await adapter.discoverEditions(context);
  const summary: SourceRunSummary = {
    editionsDiscovered: editions.length,
    recordsParsed: 0,
    recordsInserted: 0,
    recordsUpdated: 0,
    recordsUnchanged: 0,
    recordsFailed: 0,
    records: [],
  };

  for (const edition of editions) {
    const sourceEditionId = await persistEdition(sourceSeries.id, edition);
    let raws: ScrapedChallenge[] = [];
    try {
      raws = await adapter.fetchChallenges(edition, context);
    } catch (error) {
      log.error("adapter.fetchChallenges threw", { source: sourceSeries.slug, year: edition.year, error: String(error) });
      continue;
    }

    for (const raw of raws) {
      summary.recordsParsed += 1;
      try {
        const result = await processScrapedChallenge({ raw, sourceSeries, sourceEditionId });
        summary.records.push(result);
        if (result.outcome === "insert") summary.recordsInserted += 1;
        else if (result.outcome === "update") summary.recordsUpdated += 1;
        else if (result.outcome === "unchanged") summary.recordsUnchanged += 1;
      } catch (error) {
        summary.recordsFailed += 1;
        summary.records.push({ outcome: "failed", name: raw.name, officialUrl: raw.officialUrl, error: String(error) });
        log.error("failed to process scraped challenge", { source: sourceSeries.slug, name: raw.name, error: String(error) });
      }
    }
  }

  return summary;
}

/**
 * Section 48 — Data Quality Checks. Flags a run as suspect when the record
 * count collapses relative to the previous successful run, or when a source
 * with discovered editions parsed zero records — without ever deleting the
 * previously-good data those anomalies would otherwise threaten.
 */
export function detectAnomaly(summary: SourceRunSummary, previousRecordsParsed: number | null): string | null {
  if (summary.editionsDiscovered > 0 && summary.recordsParsed === 0) {
    return "parser returned zero records despite discovering editions";
  }
  if (previousRecordsParsed && previousRecordsParsed > 0) {
    const drop = 1 - summary.recordsParsed / previousRecordsParsed;
    if (drop > 0.8) {
      return `record count dropped ${(drop * 100).toFixed(0)}% vs previous run (${previousRecordsParsed} -> ${summary.recordsParsed})`;
    }
  }
  return null;
}

export async function getPreviousSuccessfulRunRecordCount(sourceSeriesId: string): Promise<number | null> {
  const [previous] = await db
    .select({ recordsParsed: crawlRuns.recordsParsed })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.sourceSeriesId, sourceSeriesId), eq(crawlRuns.status, "success")))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(1);
  return previous?.recordsParsed ?? null;
}
