import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { challengeSourceRecords, challenges } from "@/db/schema";
import { normalizeNameForMatching } from "@/lib/normalize";
import { getRegistrableDomain } from "@/lib/scraping/normalizeUrl";

export type ChallengeRow = typeof challenges.$inferSelect;

export type DedupeMatch = {
  kind: "external_key" | "exact_name_venue" | "uncertain_domain_year" | "none";
  challenge: ChallengeRow | null;
  /** Whether the caller should auto-merge into `challenge`. Only true for
   * high-confidence matches (Section 17: "do not auto-merge low-confidence
   * cases; uncertain -> preserve separately -> admin review"). */
  autoMerge: boolean;
  reason: string;
};

function tokenSet(name: string): Set<string> {
  return new Set(normalizeNameForMatching(name).split(" ").filter(Boolean));
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type PossibleDuplicatePair = {
  a: ChallengeRow;
  b: ChallengeRow;
  similarity: number;
};

/**
 * Section 51 — surfaces likely-duplicate pairs for admin review. Scoped to
 * challenges sharing the same venue + venue_year (already indexed) rather
 * than a full cross join, since two challenges worth comparing always share
 * at least that much context at our expected scale (Section 58: <10,000
 * challenges total, so even a per-venue-year O(n^2) scan is cheap).
 */
export async function findPossibleDuplicates(): Promise<PossibleDuplicatePair[]> {
  const all = await db.select().from(challenges).where(eq(challenges.isHidden, false));

  const groups = new Map<string, ChallengeRow[]>();
  for (const challenge of all) {
    if (!challenge.venueId || !challenge.venueYear) continue;
    const key = `${challenge.venueId}:${challenge.venueYear}`;
    const list = groups.get(key) ?? [];
    list.push(challenge);
    groups.set(key, list);
  }

  const pairs: PossibleDuplicatePair[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i];
        const b = group[j];
        // Same venue + year alone isn't enough signal: two genuinely
        // distinct tracks under one umbrella event (e.g. two separate KDD
        // Cup 2026 sponsor tracks) share those tokens too. Requiring the
        // same official domain — the same signal the crawl-time dedupe
        // check uses for "uncertain_domain_year" — is what actually
        // distinguishes "same challenge, seen twice" from "two different
        // challenges that happen to share an event name" (Section 17:
        // false merge is worse than duplicate display).
        const sameDomain = getRegistrableDomain(a.officialUrl) === getRegistrableDomain(b.officialUrl);
        if (!sameDomain) continue;

        const similarity = jaccardSimilarity(a.name, b.name);
        if (similarity >= 0.4 && similarity < 1) {
          pairs.push({ a, b, similarity });
        }
      }
    }
  }

  return pairs.sort((x, y) => y.similarity - x.similarity);
}

export type DedupeCandidateInput = {
  externalKey?: string;
  name: string;
  officialUrl: string;
  venueId?: string | null;
  venueYear?: number | null;
};

/**
 * Section 17 — Deduplication. Uses deterministic candidate matching:
 * external key (exact), then venue + venue year + normalized name (exact),
 * then official domain + venue year with fuzzy name similarity as an
 * "uncertain" signal that is surfaced for admin review rather than merged.
 */
export async function findExistingChallenge(
  sourceSeriesId: string,
  input: DedupeCandidateInput,
): Promise<DedupeMatch> {
  if (input.externalKey) {
    const [record] = await db
      .select()
      .from(challengeSourceRecords)
      .where(
        and(
          eq(challengeSourceRecords.sourceSeriesId, sourceSeriesId),
          eq(challengeSourceRecords.externalKey, input.externalKey),
        ),
      )
      .limit(1);
    if (record) {
      const [challenge] = await db.select().from(challenges).where(eq(challenges.id, record.challengeId)).limit(1);
      if (challenge) {
        return { kind: "external_key", challenge, autoMerge: true, reason: "matched external_key from same source series" };
      }
    }
  }

  if (input.venueId && input.venueYear) {
    const candidates = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.venueId, input.venueId), eq(challenges.venueYear, input.venueYear)));

    const normalizedTarget = normalizeNameForMatching(input.name);
    const exact = candidates.find((c) => normalizeNameForMatching(c.name) === normalizedTarget);
    if (exact) {
      return { kind: "exact_name_venue", challenge: exact, autoMerge: true, reason: "exact normalized name + venue + venue_year match" };
    }

    const targetDomain = getRegistrableDomain(input.officialUrl);
    const fuzzy = candidates.find((c) => {
      const sameDomain = targetDomain && getRegistrableDomain(c.officialUrl) === targetDomain;
      const similarity = jaccardSimilarity(c.name, input.name);
      return sameDomain && similarity >= 0.4 && similarity < 1;
    });
    if (fuzzy) {
      return {
        kind: "uncertain_domain_year",
        challenge: fuzzy,
        autoMerge: false,
        reason: "same domain + venue_year but name similarity below auto-merge threshold; preserved separately for admin review",
      };
    }
  }

  return { kind: "none", challenge: null, autoMerge: false, reason: "no candidate matched" };
}
