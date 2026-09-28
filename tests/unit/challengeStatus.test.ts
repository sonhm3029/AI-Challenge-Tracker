import { describe, expect, it } from "vitest";
import { computeChallengeStatus } from "@/lib/challengeStatus";

const NOW = new Date("2027-01-15T00:00:00Z");
const past = (days: number) => new Date(NOW.getTime() - days * 86400000);
const future = (days: number) => new Date(NOW.getTime() + days * 86400000);

describe("computeChallengeStatus", () => {
  it("returns unknown when no dates are known", () => {
    expect(computeChallengeStatus({}, NOW)).toBe("unknown");
  });

  it("returns upcoming when registration/start is in the future", () => {
    expect(computeChallengeStatus({ registrationStart: future(5) }, NOW)).toBe("upcoming");
    expect(computeChallengeStatus({ challengeStart: future(10) }, NOW)).toBe("upcoming");
  });

  it("returns open when registration is currently open", () => {
    expect(
      computeChallengeStatus({ registrationStart: past(1), registrationDeadline: future(5) }, NOW),
    ).toBe("open");
  });

  it("returns open when submissions are currently open", () => {
    expect(
      computeChallengeStatus({ challengeStart: past(10), submissionDeadline: future(5) }, NOW),
    ).toBe("open");
  });

  it("returns evaluation when submissions closed but evaluation window is active", () => {
    expect(
      computeChallengeStatus(
        { submissionDeadline: past(2), evaluationStart: past(2), evaluationEnd: future(5) },
        NOW,
      ),
    ).toBe("evaluation");
  });

  it("returns evaluation when submissions closed and only a later workshop date remains", () => {
    expect(
      computeChallengeStatus({ submissionDeadline: past(2), workshopDate: future(20) }, NOW),
    ).toBe("evaluation");
  });

  it("returns closed once every known date is in the past", () => {
    expect(
      computeChallengeStatus(
        { registrationDeadline: past(30), submissionDeadline: past(10), workshopDate: past(2) },
        NOW,
      ),
    ).toBe("closed");
  });

  it("returns closed for a submission-only challenge whose deadline has passed", () => {
    expect(computeChallengeStatus({ submissionDeadline: past(1) }, NOW)).toBe("closed");
  });

  it("returns evaluation when submission/evaluation windows have both passed but a workshop is still upcoming", () => {
    // Regression: a real RecSys Challenge 2026 crawl produced exactly this
    // shape (submissionDeadline and evaluationEnd both past, workshopDate
    // still future) and the status came out "unknown" instead of
    // "evaluation" before this was fixed.
    expect(
      computeChallengeStatus(
        {
          challengeStart: past(170),
          challengeEnd: past(90),
          submissionDeadline: past(81),
          evaluationStart: past(97),
          evaluationEnd: past(83),
          workshopDate: future(4),
        },
        NOW,
      ),
    ).toBe("evaluation");
  });
});
