import type { ChallengeStatus } from "@/db/schema";
import type { NormalizedChallenge } from "@/lib/normalize";
import { parsedDateOrNull } from "@/lib/normalize";
import { computeChallengeStatus } from "@/lib/challengeStatus";
import { resolveTimezoneAlias } from "@/lib/dates/timezones";

export function pickTimezoneLabel(scraped: NormalizedChallenge): string | undefined {
  const candidates = [
    scraped.registrationDeadline,
    scraped.submissionDeadline,
    scraped.challengeEnd,
    scraped.evaluationEnd,
    scraped.workshopDate,
    scraped.registrationStart,
    scraped.challengeStart,
    scraped.evaluationStart,
  ];
  return candidates.find((d) => d?.timezone)?.timezone;
}

export function buildDateColumns(scraped: NormalizedChallenge) {
  return {
    registrationStart: parsedDateOrNull(scraped.registrationStart),
    registrationDeadline: parsedDateOrNull(scraped.registrationDeadline),
    challengeStart: parsedDateOrNull(scraped.challengeStart),
    challengeEnd: parsedDateOrNull(scraped.challengeEnd),
    submissionDeadline: parsedDateOrNull(scraped.submissionDeadline),
    evaluationStart: parsedDateOrNull(scraped.evaluationStart),
    evaluationEnd: parsedDateOrNull(scraped.evaluationEnd),
    workshopDate: parsedDateOrNull(scraped.workshopDate),
  };
}

/**
 * The single source of truth for "what would the crawler write for this
 * scraped challenge", shared between the real write path
 * (jobs/updateSource.ts) and the dry-run diff (jobs/dryRun.ts) so a dry run
 * can never drift from what an actual crawl would do.
 */
export function buildProposedChallengeFields(scraped: NormalizedChallenge, venueId: string | undefined) {
  const status: ChallengeStatus = computeChallengeStatus(buildDateColumns(scraped));
  const timezoneLabel = pickTimezoneLabel(scraped);

  return {
    name: scraped.name,
    shortName: scraped.shortName ?? null,
    description: scraped.description ?? null,
    venueId: venueId ?? null,
    venueYear: scraped.venueYear ?? null,
    hostPlatform: scraped.hostPlatform ?? null,
    status,
    officialUrl: scraped.officialUrl,
    timezone: timezoneLabel ? (resolveTimezoneAlias(timezoneLabel) ?? timezoneLabel) : null,
    timezoneOriginal: timezoneLabel ?? null,
    ...buildDateColumns(scraped),
  };
}
