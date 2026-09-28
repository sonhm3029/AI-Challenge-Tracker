import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recsysChallengeAdapter } from "@/scrapers/recsys";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE_2026 = path.join(__dirname, "../fixtures/recsys/2026.html");
const FIXTURE_2025 = path.join(__dirname, "../fixtures/recsys/2025.html");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recsysChallengeAdapter", () => {
  it("discovers editions via the predictable year-URL pattern", async () => {
    stubFetchWithFixtures([
      { match: "recsyschallenge.com/2025", fixturePath: FIXTURE_2025 },
      { match: "recsyschallenge.com/2026", fixturePath: FIXTURE_2026 },
      // 2027 (and any other probed year) has no route and falls back to the
      // stub's default 404 response, matching the real site today.
    ]);

    const editions = await recsysChallengeAdapter.discoverEditions({
      now: new Date("2026-09-28T00:00:00Z"),
      dryRun: false,
    });

    expect(editions.some((e) => e.year === 2025)).toBe(true);
    expect(editions.some((e) => e.year === 2026)).toBe(true);
    expect(editions.some((e) => e.year === 2027)).toBe(false);

    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toContain("recsyschallenge.com/2026");
  });

  it("extracts the 2026 challenge's title, URL, links, domains, and dates", async () => {
    stubFetchWithFixtures([{ match: "recsyschallenge.com/2026", fixturePath: FIXTURE_2026 }]);

    const challenges = await recsysChallengeAdapter.fetchChallenges(
      { year: 2026, url: "https://www.recsyschallenge.com/2026/" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(1);
    const [challenge] = challenges;

    expect(challenge.name).toContain("RecSys Challenge 2026");
    expect(challenge.name).toContain("Conversational Music Recommendation");
    expect(challenge.officialUrl).toBe("https://www.recsyschallenge.com/2026");
    expect(challenge.venueSlug).toBe("recsys");
    expect(challenge.venueYear).toBe(2026);
    expect(challenge.domains).toContain("Recommender Systems");

    // The 2026 edition (Music-CRS) explicitly bridges NLP and RecSys and
    // uses an "LLM-as-a-Judge" evaluation component, both stated verbatim
    // on the page.
    expect(challenge.domains).toContain("NLP");
    expect(challenge.domains).toContain("LLM");

    // Real Codabench competition link from the page's "Official reference"
    // paragraph: https://www.codabench.org/competitions/15786/
    expect(challenge.hostPlatform).toBe("Codabench");
    const codabenchLink = challenge.links?.find((l) => l.type === "platform");
    expect(codabenchLink?.url).toBe("https://www.codabench.org/competitions/15786");

    // "Timeline" table on the real page (dates are date-first, reverse of
    // the generic (label, date) table shape, so this exercises the
    // adapter's bespoke row parsing).
    expect(challenge.challengeStart?.value?.toISOString().slice(0, 10)).toBe("2026-04-10");
    expect(challenge.submissionDeadline?.value?.toISOString().slice(0, 10)).toBe("2026-07-09");
    expect(challenge.workshopDate?.value?.toISOString().slice(0, 10)).toBe("2026-10-02");
  });

  it("extracts a structurally different 2025 edition (different host platform, GitHub + dataset links)", async () => {
    stubFetchWithFixtures([{ match: "recsyschallenge.com/2025", fixturePath: FIXTURE_2025 }]);

    const challenges = await recsysChallengeAdapter.fetchChallenges(
      { year: 2025, url: "https://www.recsyschallenge.com/2025/" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(1);
    const [challenge] = challenges;

    expect(challenge.name).toContain("RecSys Challenge 2025");
    expect(challenge.venueYear).toBe(2025);
    expect(challenge.domains).toEqual(["Recommender Systems"]);

    // 2025 used its own bespoke Synerise-hosted platform rather than a
    // known one, so no hostPlatform should be inferred, but its real
    // GitHub baseline repo and dataset download link should still surface.
    expect(challenge.hostPlatform).toBeUndefined();
    const githubLink = challenge.links?.find((l) => l.type === "github");
    expect(githubLink?.url).toBe("https://github.com/Synerise/recsys2025");
    const datasetLink = challenge.links?.find((l) => l.url.includes("ubc_data.tar.gz"));
    expect(datasetLink?.type).toBe("dataset");

    expect(challenge.challengeStart?.value?.toISOString().slice(0, 10)).toBe("2025-03-10");
    expect(challenge.challengeEnd?.value?.toISOString().slice(0, 10)).toBe("2025-06-25");
  });
});
