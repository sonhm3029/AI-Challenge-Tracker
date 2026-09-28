import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { neuripsCompetitionsAdapter } from "@/scrapers/neurips";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const CATEGORY_FIXTURE = path.join(__dirname, "../fixtures/neurips/2026-category.html");
const LISTING_FIXTURE = path.join(__dirname, "../fixtures/neurips/2026.html");
const QUANTIPHY_FIXTURE = path.join(__dirname, "../fixtures/neurips/quantiphy.html");
const SAPC2_FIXTURE = path.join(__dirname, "../fixtures/neurips/sapc2.html");

const ANNOUNCEMENT_URL = "https://blog.neurips.cc/2026/07/28/neurips-2026-competitions-announced/";

const now = new Date("2026-09-28T00:00:00Z");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("neuripsCompetitionsAdapter", () => {
  it("discovers the 2026 edition via the stable per-year blog archive page", async () => {
    stubFetchWithFixtures([{ match: "blog.neurips.cc/category/2026-conference", fixturePath: CATEGORY_FIXTURE }]);

    const editions = await neuripsCompetitionsAdapter.discoverEditions({ now, dryRun: false });

    expect(editions.some((e) => e.year === 2026)).toBe(true);
    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toBe(ANNOUNCEMENT_URL);

    // Neighbouring years have no matching route stubbed, so fetchHtml gets a
    // 404 for them and they're correctly skipped rather than fabricated.
    expect(editions.some((e) => e.year === 2025)).toBe(false);
    expect(editions.some((e) => e.year === 2027)).toBe(false);
  });

  it("extracts many distinct real competitions from the 2026 cohort", async () => {
    stubFetchWithFixtures([{ match: "neurips-2026-competitions-announced", fixturePath: LISTING_FIXTURE }]);

    const challenges = await neuripsCompetitionsAdapter.fetchChallenges(
      { year: 2026, url: ANNOUNCEMENT_URL },
      { now, dryRun: false },
    );

    // The real 2026 NeurIPS Competition Track cohort has 16 accepted
    // competitions, all with a linked official site.
    expect(challenges.length).toBe(16);

    const names = challenges.map((c) => c.name);
    expect(names).toContain("RoCo-Spring: The Robust Correspondence Challenge");
    expect(names).toContain("QuantiPhy Challenge: Quantitative Physical Reasoning for VLMs");
    expect(names).toContain("Speech Accessibility Project Challenge 2");

    for (const challenge of challenges) {
      expect(challenge.venueSlug).toBe("neurips");
      expect(challenge.venueYear).toBe(2026);
      expect(challenge.officialUrl).toMatch(/^https?:\/\//);
      expect(challenge.externalKey).toMatch(/^neurips-2026-/);
      expect(challenge.domains?.length).toBeGreaterThan(0);
    }

    const roboSyn = challenges.find((c) => c.name.startsWith("RoboSynChallenge"))!;
    expect(roboSyn.domains).toContain("Robotics");

    const quantiphy = challenges.find((c) => c.name.startsWith("QuantiPhy"))!;
    expect(quantiphy.officialUrl).toBe("https://quantiphy.stanford.edu/competition/index.html");
  });

  it("enriches a competition with dates parsed from its own official page (QuantiPhy)", async () => {
    stubFetchWithFixtures([
      { match: "neurips-2026-competitions-announced", fixturePath: LISTING_FIXTURE },
      { match: "quantiphy.stanford.edu", fixturePath: QUANTIPHY_FIXTURE },
    ]);

    const challenges = await neuripsCompetitionsAdapter.fetchChallenges(
      { year: 2026, url: ANNOUNCEMENT_URL },
      { now, dryRun: false },
    );

    const quantiphy = challenges.find((c) => c.name.startsWith("QuantiPhy"))!;
    expect(quantiphy.registrationDeadline?.value?.toISOString().slice(0, 10)).toBe("2026-10-09");
    expect(quantiphy.submissionDeadline?.value?.toISOString().slice(0, 10)).toBe("2026-10-23");
  });

  it("special-cases a site's exact date wording via a local label alias (SAPC2's 'Competition Deadline')", async () => {
    stubFetchWithFixtures([
      { match: "neurips-2026-competitions-announced", fixturePath: LISTING_FIXTURE },
      { match: "xiuwenz2.github.io", fixturePath: SAPC2_FIXTURE },
    ]);

    const challenges = await neuripsCompetitionsAdapter.fetchChallenges(
      { year: 2026, url: ANNOUNCEMENT_URL },
      { now, dryRun: false },
    );

    const sapc2 = challenges.find((c) => c.name === "Speech Accessibility Project Challenge 2")!;
    expect(sapc2.submissionDeadline?.value?.toISOString().slice(0, 10)).toBe("2026-10-24");
  });

  it("still returns a name + official link (no fabricated dates) when a competition's own site has no parseable dates", async () => {
    // No secondary-fetch route stubbed for these sites at all -> fetchHtml
    // gets a 404, and the adapter must fall back gracefully.
    stubFetchWithFixtures([{ match: "neurips-2026-competitions-announced", fixturePath: LISTING_FIXTURE }]);

    const challenges = await neuripsCompetitionsAdapter.fetchChallenges(
      { year: 2026, url: ANNOUNCEMENT_URL },
      { now, dryRun: false },
    );

    const learn2design = challenges.find((c) => c.name.startsWith("Learn2Design"))!;
    expect(learn2design.officialUrl).toBe("https://www.learn2design2026.com/");
    expect(learn2design.registrationDeadline).toBeUndefined();
    expect(learn2design.submissionDeadline).toBeUndefined();
    expect(learn2design.challengeStart).toBeUndefined();
  });
});
