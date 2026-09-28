import type { ChallengeLinkType } from "@/db/schema";
import type { ParsedDate } from "@/lib/dates/parsedDate";

/**
 * Section 10 — Source Adapter Interface. Every adapter (scrapers/*.ts)
 * implements this contract and nothing else; the crawler job orchestrates
 * discovery, fetching, validation, normalization, dedupe and upsert on top
 * of it, so an adapter never needs to know about the database.
 */
export interface CrawlContext {
  now: Date;
  /** True when invoked via `npm run crawl:dry-run` — adapters should not
   * need to branch on this, but it is available for adapters that want to
   * skip expensive optional enrichment during dry runs. */
  dryRun: boolean;
}

export interface SourceEditionCandidate {
  year: number;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface ScrapedChallengeLink {
  label: string;
  type: ChallengeLinkType;
  url: string;
}

export interface ScrapedChallenge {
  /** Stable identifier from the source (e.g. a platform competition id).
   * Strongly preferred for dedupe when available. */
  externalKey?: string;

  name: string;
  shortName?: string;
  description?: string;

  venueSlug?: string;
  venueYear?: number;

  officialUrl: string;

  links?: ScrapedChallengeLink[];

  hostPlatform?: string;

  registrationStart?: ParsedDate;
  registrationDeadline?: ParsedDate;

  challengeStart?: ParsedDate;
  challengeEnd?: ParsedDate;

  submissionDeadline?: ParsedDate;

  evaluationStart?: ParsedDate;
  evaluationEnd?: ParsedDate;

  workshopDate?: ParsedDate;

  domains?: string[];
  taskTags?: string[];

  sourceUrl: string;

  rawPayload?: unknown;
}

export interface ChallengeSourceAdapter {
  sourceId: string;
  venueSlug?: string;

  discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]>;

  fetchChallenges(edition: SourceEditionCandidate, context: CrawlContext): Promise<ScrapedChallenge[]>;
}
