import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wsdmCupAdapter } from "@/scrapers/wsdm";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE = path.join(__dirname, "../fixtures/wsdm/2026.html");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wsdmCupAdapter", () => {
  it("discovers the known 2026 edition", async () => {
    stubFetchWithFixtures([{ match: "wsdmcup-2026.github.io", fixturePath: FIXTURE }]);

    const editions = await wsdmCupAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    expect(editions.some((e) => e.year === 2026)).toBe(true);
    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toContain("wsdmcup-2026.github.io");
  });

  it("extracts the challenge title, official URL, and dates from the fixture", async () => {
    stubFetchWithFixtures([{ match: "wsdmcup-2026.github.io", fixturePath: FIXTURE }]);

    const challenges = await wsdmCupAdapter.fetchChallenges(
      { year: 2026, url: "https://wsdmcup-2026.github.io/" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(1);
    const [challenge] = challenges;

    expect(challenge.name).toContain("WSDM Cup 2026");
    expect(challenge.name).toContain("Multilingual Retrieval");
    expect(challenge.officialUrl).toBe("https://wsdmcup-2026.github.io/");
    expect(challenge.venueSlug).toBe("wsdm");
    expect(challenge.venueYear).toBe(2026);

    // "Important Dates" list is date-first ("November 17, 2025: ...").
    expect(challenge.challengeStart?.value?.getUTCFullYear()).toBe(2025);
    expect(challenge.workshopDate?.value?.toISOString().slice(0, 10)).toBe("2026-02-26");
  });
});
