import type { ChallengeSourceAdapter, ScrapedChallenge, SourceEditionCandidate } from "@/scrapers/types";
import { normalizeScrapedChallenge } from "@/lib/normalize";
import { buildProposedChallengeFields } from "@/lib/challengeFields";
import { hashScrapedChallenge } from "@/lib/contentHash";
import { findExistingChallenge } from "@/lib/dedupe";
import { getVenueIdBySlug } from "@/lib/taxonomy";
import type { SourceSeriesRow } from "@/jobs/updateSource";

export type DryRunChallengeResult = {
  name: string;
  officialUrl: string;
  outcome: "new" | "updated" | "unchanged" | "duplicate_uncertain";
  changes: { field: string; old: unknown; new: unknown }[];
  dedupeReason: string;
};

export type DryRunEditionResult = {
  year: number;
  url: string;
  challenges: DryRunChallengeResult[];
};

/**
 * Section 59/60 — Dry-Run Mode. Runs discovery + fetch + normalize + dedupe
 * exactly like a real crawl, but never writes to the database: no
 * source_editions row, no challenges/links/taxonomy/provenance writes, and
 * no crawl_runs row. Safe to run repeatedly against production data.
 */
export async function dryRunSource(
  adapter: ChallengeSourceAdapter,
  sourceSeries: SourceSeriesRow,
  now: Date,
): Promise<DryRunEditionResult[]> {
  const editions: SourceEditionCandidate[] = await adapter.discoverEditions({ now, dryRun: true });
  const results: DryRunEditionResult[] = [];

  for (const edition of editions) {
    const raws: ScrapedChallenge[] = await adapter.fetchChallenges(edition, { now, dryRun: true });
    const challengeResults: DryRunChallengeResult[] = [];

    for (const raw of raws) {
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

      if (!dedupe.autoMerge || !dedupe.challenge) {
        challengeResults.push({
          name: scraped.name,
          officialUrl: scraped.officialUrl,
          outcome: dedupe.kind === "uncertain_domain_year" ? "duplicate_uncertain" : "new",
          changes: [],
          dedupeReason: dedupe.reason,
        });
        continue;
      }

      const existing = dedupe.challenge;
      const proposed = buildProposedChallengeFields(scraped, venueId);
      const changes: { field: string; old: unknown; new: unknown }[] = [];
      for (const [field, newValue] of Object.entries(proposed)) {
        const oldValue = (existing as unknown as Record<string, unknown>)[field];
        const oldSerialized = oldValue instanceof Date ? oldValue.toISOString() : oldValue;
        const newSerialized = newValue instanceof Date ? newValue.toISOString() : newValue;
        if (JSON.stringify(oldSerialized) !== JSON.stringify(newSerialized)) {
          changes.push({ field, old: oldSerialized ?? null, new: newSerialized ?? null });
        }
      }

      challengeResults.push({
        name: scraped.name,
        officialUrl: scraped.officialUrl,
        outcome: changes.length > 0 ? "updated" : "unchanged",
        changes,
        dedupeReason: dedupe.reason,
      });
      void contentHash; // computed for parity with the real pipeline; not needed for display
    }

    results.push({ year: edition.year, url: edition.url, challenges: challengeResults });
  }

  return results;
}
