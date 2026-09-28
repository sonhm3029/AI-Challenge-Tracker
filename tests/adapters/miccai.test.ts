import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { grandChallengeAdapter } from "@/scrapers/miccai";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE = path.join(__dirname, "../fixtures/miccai/challenges.json");
const NOW = new Date("2026-09-28T00:00:00Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("grandChallengeAdapter", () => {
  it("discovers a single synthetic edition for the current index snapshot", async () => {
    const editions = await grandChallengeAdapter.discoverEditions({ now: NOW, dryRun: false });

    expect(editions).toHaveLength(1);
    expect(editions[0].year).toBe(2026);
    expect(editions[0].url).toBe("https://grand-challenge.org/challenges/");
  });

  it("fetches only OPEN/OPEN_SOON challenges from the real fixture snapshot", async () => {
    stubFetchWithFixtures([{ match: "grand-challenge.org/api/v1/challenges", fixturePath: FIXTURE }]);

    const editions = await grandChallengeAdapter.discoverEditions({ now: NOW, dryRun: false });
    const challenges = await grandChallengeAdapter.fetchChallenges(editions[0], { now: NOW, dryRun: false });

    // The 34-entry fixture page contains a mix of OPEN, OPEN_SOON, CLOSED,
    // and COMPLETED challenges; only the 9 OPEN/OPEN_SOON ones should be
    // surfaced (BEETLE, DALPHIN, ToothFairy3, LUNOVO26, CLEAR-EC,
    // chimera-agent, TopBrain2026, COBRA2026, SELMA3D2026).
    expect(challenges).toHaveLength(9);
    expect(challenges.every((c) => c.venueSlug === "miccai")).toBe(true);

    const slugs = challenges.map((c) => c.externalKey);
    expect(slugs).toContain("grand-challenge-LUNOVO26");
    expect(slugs).toContain("grand-challenge-BEETLE");
    expect(slugs).not.toContain("grand-challenge-ATM26"); // CLOSED, excluded
    expect(slugs).not.toContain("grand-challenge-HECKTOR26"); // COMPLETED, excluded
  });

  it("extracts title, official URL, and start/end dates for a dated challenge", async () => {
    stubFetchWithFixtures([{ match: "grand-challenge.org/api/v1/challenges", fixturePath: FIXTURE }]);

    const editions = await grandChallengeAdapter.discoverEditions({ now: NOW, dryRun: false });
    const challenges = await grandChallengeAdapter.fetchChallenges(editions[0], { now: NOW, dryRun: false });

    const lunovo = challenges.find((c) => c.externalKey === "grand-challenge-LUNOVO26");
    expect(lunovo).toBeDefined();
    expect(lunovo!.name).toBe("Lung Nodule Volumetry 2026 Challenge");
    expect(lunovo!.officialUrl).toBe("https://lunovo26.grand-challenge.org/");
    expect(lunovo!.sourceUrl).toBe("https://grand-challenge.org/api/v1/challenges/LUNOVO26");
    expect(lunovo!.venueYear).toBe(2026);
    expect(lunovo!.hostPlatform).toBe("Grand-Challenge.org");
    expect(lunovo!.domains).toContain("Medical AI");
    expect(lunovo!.domains).toContain("Computer Vision");

    // start_date/end_date are the only dates this source provides (no
    // registration/submission/workshop timeline) — extract exactly those.
    expect(lunovo!.challengeStart?.value?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(lunovo!.challengeEnd?.value?.toISOString()).toBe("2026-12-31T13:05:00.000Z");
    expect(lunovo!.registrationDeadline).toBeUndefined();
  });

  it("falls back to the crawl year when a challenge has no start_date and no year in its name", async () => {
    stubFetchWithFixtures([{ match: "grand-challenge.org/api/v1/challenges", fixturePath: FIXTURE }]);

    const editions = await grandChallengeAdapter.discoverEditions({ now: NOW, dryRun: false });
    const challenges = await grandChallengeAdapter.fetchChallenges(editions[0], { now: NOW, dryRun: false });

    const beetle = challenges.find((c) => c.externalKey === "grand-challenge-BEETLE");
    expect(beetle).toBeDefined();
    expect(beetle!.name).toBe("BEETLE");
    expect(beetle!.officialUrl).toBe("https://beetle.grand-challenge.org/");
    expect(beetle!.challengeStart).toBeUndefined();
    expect(beetle!.venueYear).toBe(2026); // no start_date, no digits in slug/title -> crawl year
  });

  it("derives the year from a 2-digit suffix in the slug when start_date is present", async () => {
    stubFetchWithFixtures([{ match: "grand-challenge.org/api/v1/challenges", fixturePath: FIXTURE }]);

    const editions = await grandChallengeAdapter.discoverEditions({ now: NOW, dryRun: false });
    const challenges = await grandChallengeAdapter.fetchChallenges(editions[0], { now: NOW, dryRun: false });

    const cobra = challenges.find((c) => c.externalKey === "grand-challenge-COBRA2026");
    expect(cobra).toBeDefined();
    // COBRA2026's start_date is actually in 2027, so venueYear (derived from
    // start_date first) should reflect that real value rather than the
    // number baked into the slug.
    expect(cobra!.venueYear).toBe(2027);
    expect(cobra!.challengeStart?.value?.toISOString()).toBe("2027-01-15T23:01:00.000Z");
  });
});
