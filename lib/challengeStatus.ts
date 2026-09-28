import type { ChallengeStatus } from "@/db/schema";

export type ChallengeStatusInput = {
  registrationStart?: Date | null;
  registrationDeadline?: Date | null;
  challengeStart?: Date | null;
  challengeEnd?: Date | null;
  submissionDeadline?: Date | null;
  evaluationStart?: Date | null;
  evaluationEnd?: Date | null;
  workshopDate?: Date | null;
};

/**
 * Section 15 — derives challenge status from the structured dates we have.
 * A manual status override (field_overrides on "status") always wins over
 * this computed value; callers should apply that override after calling
 * this function, not before.
 */
export function computeChallengeStatus(input: ChallengeStatusInput, now: Date = new Date()): ChallengeStatus {
  const {
    registrationStart,
    registrationDeadline,
    challengeStart,
    challengeEnd,
    submissionDeadline,
    evaluationStart,
    evaluationEnd,
    workshopDate,
  } = input;

  const dates = [
    registrationStart,
    registrationDeadline,
    challengeStart,
    challengeEnd,
    submissionDeadline,
    evaluationStart,
    evaluationEnd,
    workshopDate,
  ].filter((d): d is Date => d instanceof Date);

  if (dates.length === 0) return "unknown";

  const t = now.getTime();

  // The last known relevant instant for participants (submission close, or
  // challenge end if there's no separate submission deadline).
  const participationEnd = submissionDeadline ?? challengeEnd ?? null;

  const lastKnownInstant = dates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max), dates[0]);

  // Closed: every known relevant date is in the past.
  if (lastKnownInstant.getTime() <= t) {
    return "closed";
  }

  // Evaluation: participation window closed, but something later (an
  // explicit evaluation window, a workshop, an announcement) is still
  // upcoming — we already know that from the "closed" check above, so
  // reaching here with a past participation end means "evaluation",
  // regardless of whether evaluation_end/workshop_date specifically is the
  // thing still pending.
  if (participationEnd && participationEnd.getTime() <= t) {
    return "evaluation";
  }

  // Open: at least one activity window is currently active. Each window
  // requires positive evidence (at least one of its bounds present) —
  // two absent bounds must not default to "currently open".
  const registrationOpen =
    Boolean(registrationStart || registrationDeadline) &&
    (!registrationStart || registrationStart.getTime() <= t) &&
    (!registrationDeadline || registrationDeadline.getTime() > t);

  const submissionsOpen =
    Boolean(challengeStart || submissionDeadline) &&
    (!challengeStart || challengeStart.getTime() <= t) &&
    (!submissionDeadline || submissionDeadline.getTime() > t);

  const participationActive =
    challengeStart && challengeStart.getTime() <= t && (!challengeEnd || challengeEnd.getTime() > t);

  if (registrationOpen || submissionsOpen || participationActive) {
    return "open";
  }

  // Upcoming: nothing has started yet.
  const earliestStart = [registrationStart, challengeStart].filter((d): d is Date => d instanceof Date);
  if (earliestStart.length > 0 && earliestStart.every((d) => d.getTime() > t)) {
    return "upcoming";
  }

  return "unknown";
}
