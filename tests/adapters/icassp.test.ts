import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { icasspGrandChallengesAdapter } from "@/scrapers/icassp";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE_2026 = path.join(__dirname, "../fixtures/icassp/2026.html");
const FIXTURE_2025 = path.join(__dirname, "../fixtures/icassp/2025.html");

const NOW = new Date("2026-09-28T00:00:00Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("icasspGrandChallengesAdapter", () => {
  it("discovers editions via the predictable {year}.ieeeicassp.org URL pattern", async () => {
    stubFetchWithFixtures([
      { match: "2026.ieeeicassp.org/sp-grand-challenges", fixturePath: FIXTURE_2026 },
      { match: "2025.ieeeicassp.org/sp-grand-challenges", fixturePath: FIXTURE_2025 },
      // 2027/2028 intentionally left unstubbed -> the fetch stub 404s them,
      // exercising the "not every probed year resolves" path.
    ]);

    const editions = await icasspGrandChallengesAdapter.discoverEditions({ now: NOW, dryRun: false });

    expect(editions.some((e) => e.year === 2026)).toBe(true);
    expect(editions.some((e) => e.year === 2025)).toBe(true);
    expect(editions.some((e) => e.year === 2027)).toBe(false);
    expect(editions.some((e) => e.year === 2028)).toBe(false);

    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toContain("2026.ieeeicassp.org");
    expect(edition2026.url).toContain("sp-grand-challenges");
  });

  it("extracts all 14 GC entries from the 2026 ('evenz' template) fixture", async () => {
    stubFetchWithFixtures([{ match: "2026.ieeeicassp.org", fixturePath: FIXTURE_2026 }]);

    const challenges = await icasspGrandChallengesAdapter.fetchChallenges(
      { year: 2026, url: "https://2026.ieeeicassp.org/sp-grand-challenges/" },
      { now: NOW, dryRun: false },
    );

    // The 2026 listing enumerates GC-1 through GC-14, none marked cancelled.
    expect(challenges).toHaveLength(14);

    const gc1 = challenges[0];
    // The listing's explicit "Title:" field ("EEG-AAD 2026: EEG Auditory
    // Attention Decoding Challenge") is fuller than the TOC heading and is
    // preferred as the challenge name.
    expect(gc1.name).toBe("EEG-AAD 2026: EEG Auditory Attention Decoding Challenge");
    expect(gc1.shortName).toBe("GC-1");
    expect(gc1.venueSlug).toBe("icassp");
    expect(gc1.venueYear).toBe(2026);
    expect(gc1.officialUrl).toBe("https://fchest.github.io/icassp-aad");
    expect(gc1.externalKey).toBe("icassp-2026-eeg-aad");
    expect(gc1.description).toMatch(/auditory attention/i);
    expect(gc1.domains).toContain("Audio");

    // Real per-paper submission link extracted alongside the challenge's own
    // website.
    const submissionLink = gc1.links?.find((l) => /submission/i.test(l.label));
    expect(submissionLink?.url).toContain("cmsworkshops.com");
    const officialLink = gc1.links?.find((l) => l.label === "Challenge website");
    expect(officialLink?.url).toBe("https://fchest.github.io/icassp-aad");

    // The conference-level SP Grand Challenges listing page does not publish
    // per-challenge dates for either year we have fixtures for (they live on
    // each challenge's own external site instead), so no date field should
    // be invented here.
    expect(gc1.challengeStart).toBeUndefined();
    expect(gc1.challengeEnd).toBeUndefined();
    expect(gc1.submissionDeadline).toBeUndefined();
    expect(gc1.registrationDeadline).toBeUndefined();

    // Spot-check a second entry to confirm parsing isn't accidentally
    // repeating the first block.
    const cadenza = challenges.find((c) => c.externalKey === "icassp-2026-cadenza");
    expect(cadenza?.name).toBe("ICASSP 2026 Cadenza Challenge: Predicting Lyric Intelligibility");
    expect(cadenza?.officialUrl).toBe("https://cadenzachallenge.org/");
  });

  it("extracts the non-cancelled GC entries from the 2025 (legacy template) fixture", async () => {
    stubFetchWithFixtures([{ match: "2025.ieeeicassp.org", fixturePath: FIXTURE_2025 }]);

    const challenges = await icasspGrandChallengesAdapter.fetchChallenges(
      { year: 2025, url: "https://2025.ieeeicassp.org/sp-grand-challenges/" },
      { now: NOW, dryRun: false },
    );

    // 2025 lists 9 GC entries; GC-2 and GC-4 are explicitly marked
    // "- Cancelled" in the source and must not be surfaced as live
    // challenges.
    expect(challenges).toHaveLength(7);
    expect(challenges.every((c) => !/cancell?ed/i.test(c.name))).toBe(true);

    const gc1 = challenges[0];
    expect(gc1.name).toBe("First Indoor Path Loss Prediction Challenge");
    expect(gc1.shortName).toBe("GC-1");
    expect(gc1.venueSlug).toBe("icassp");
    expect(gc1.venueYear).toBe(2025);
    expect(gc1.officialUrl).toBe("https://indoorradiomapchallenge.github.io/index.html");
    expect(gc1.externalKey).toBe("icassp-2025-first-indoor-path-loss-prediction-challenge");
    expect(gc1.description).toMatch(/signal propagation/i);

    // No per-challenge dates on this listing page either.
    expect(gc1.challengeStart).toBeUndefined();
    expect(gc1.submissionDeadline).toBeUndefined();
  });
});
