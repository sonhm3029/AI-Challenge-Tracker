import { describe, expect, it } from "vitest";
import { getNextRelevantMilestone } from "@/lib/challengeDeadline";

const NOW = new Date("2027-01-15T00:00:00Z");
const future = (days: number) => new Date(NOW.getTime() + days * 86400000);
const past = (days: number) => new Date(NOW.getTime() - days * 86400000);

describe("getNextRelevantMilestone", () => {
  it("returns null when no milestone is upcoming", () => {
    expect(getNextRelevantMilestone({}, NOW)).toBeNull();
    expect(getNextRelevantMilestone({ submissionDeadline: past(1) }, NOW)).toBeNull();
  });

  it("picks the earliest future milestone across all types", () => {
    const milestone = getNextRelevantMilestone(
      {
        registrationDeadline: future(20),
        submissionDeadline: future(5),
        workshopDate: future(40),
      },
      NOW,
    );
    expect(milestone?.type).toBe("submission_deadline");
    expect(milestone?.timestamp).toEqual(future(5));
  });

  it("skips past milestones and returns the next future one", () => {
    const milestone = getNextRelevantMilestone(
      { registrationDeadline: past(2), submissionDeadline: future(10) },
      NOW,
    );
    expect(milestone?.type).toBe("submission_deadline");
  });

  it("falls back to workshop date when nothing else is upcoming", () => {
    const milestone = getNextRelevantMilestone({ workshopDate: future(90) }, NOW);
    expect(milestone?.type).toBe("workshop_date");
  });
});
