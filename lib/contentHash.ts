import { createHash } from "node:crypto";
import type { NormalizedChallenge } from "@/lib/normalize";

/**
 * Section 49 — Content Hashing. Hashing only the fields that matter for
 * display means unrelated payload noise (e.g. incidental whitespace already
 * stripped by normalize.ts) doesn't cause spurious "updated" churn.
 */
export function hashScrapedChallenge(challenge: NormalizedChallenge): string {
  const relevant = {
    name: challenge.name,
    shortName: challenge.shortName,
    description: challenge.description,
    officialUrl: challenge.officialUrl,
    hostPlatform: challenge.hostPlatform,
    links: challenge.links?.map((l) => `${l.type}:${l.url}`).sort(),
    registrationStart: challenge.registrationStart?.value?.toISOString() ?? null,
    registrationDeadline: challenge.registrationDeadline?.value?.toISOString() ?? null,
    challengeStart: challenge.challengeStart?.value?.toISOString() ?? null,
    challengeEnd: challenge.challengeEnd?.value?.toISOString() ?? null,
    submissionDeadline: challenge.submissionDeadline?.value?.toISOString() ?? null,
    evaluationStart: challenge.evaluationStart?.value?.toISOString() ?? null,
    evaluationEnd: challenge.evaluationEnd?.value?.toISOString() ?? null,
    workshopDate: challenge.workshopDate?.value?.toISOString() ?? null,
    domains: challenge.domains?.slice().sort(),
    taskTags: challenge.taskTags?.slice().sort(),
  };
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}
