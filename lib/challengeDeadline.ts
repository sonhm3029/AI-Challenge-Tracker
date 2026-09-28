export type MilestoneType =
  | "registration_deadline"
  | "submission_deadline"
  | "challenge_end"
  | "evaluation_end"
  | "workshop_date";

export type Milestone = {
  type: MilestoneType;
  label: string;
  timestamp: Date;
};

const MILESTONE_LABELS: Record<MilestoneType, string> = {
  registration_deadline: "Registration deadline",
  submission_deadline: "Submission deadline",
  challenge_end: "Challenge ends",
  evaluation_end: "Evaluation ends",
  workshop_date: "Workshop",
};

export type MilestoneInput = {
  registrationDeadline?: Date | null;
  submissionDeadline?: Date | null;
  challengeEnd?: Date | null;
  evaluationEnd?: Date | null;
  workshopDate?: Date | null;
};

/**
 * Section 16 — returns the earliest future participant-relevant milestone,
 * in priority order: registration deadline, submission deadline, challenge
 * end, evaluation end, workshop date. Returns null when nothing is upcoming
 * (the UI should render "Closed" in that case per Section 30).
 */
export function getNextRelevantMilestone(input: MilestoneInput, now: Date = new Date()): Milestone | null {
  const candidates: { type: MilestoneType; timestamp?: Date | null }[] = [
    { type: "registration_deadline", timestamp: input.registrationDeadline },
    { type: "submission_deadline", timestamp: input.submissionDeadline },
    { type: "challenge_end", timestamp: input.challengeEnd },
    { type: "evaluation_end", timestamp: input.evaluationEnd },
    { type: "workshop_date", timestamp: input.workshopDate },
  ];

  const future = candidates
    .filter((c): c is { type: MilestoneType; timestamp: Date } => c.timestamp instanceof Date && c.timestamp.getTime() > now.getTime())
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (future.length === 0) return null;

  const next = future[0];
  return { type: next.type, label: MILESTONE_LABELS[next.type], timestamp: next.timestamp };
}
