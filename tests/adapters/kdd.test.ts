import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { kddCupAdapter } from "@/scrapers/kdd";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE_2025 = path.join(__dirname, "../fixtures/kdd/2025.html");
const FIXTURE_2026 = path.join(__dirname, "../fixtures/kdd/2026.html");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kddCupAdapter", () => {
  it("discovers the known editions", async () => {
    const editions = await kddCupAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    expect(editions.some((e) => e.year === 2025)).toBe(true);
    expect(editions.some((e) => e.year === 2026)).toBe(true);
    const edition2025 = editions.find((e) => e.year === 2025)!;
    expect(edition2025.url).toContain("aicrowd.com/challenges/meta-crag-mm-challenge-2025");
    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toContain("kdd2026.kdd.org");
  });

  it("extracts the single 2025 track (title, URL, dates) from the real Meta CRAG-MM page", async () => {
    stubFetchWithFixtures([{ match: "aicrowd.com/challenges/meta-crag-mm-challenge-2025", fixturePath: FIXTURE_2025 }]);

    const challenges = await kddCupAdapter.fetchChallenges(
      { year: 2025, url: "https://www.aicrowd.com/challenges/meta-crag-mm-challenge-2025" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(1);
    const [challenge] = challenges;

    expect(challenge.name).toContain("KDD Cup 2025");
    expect(challenge.name).toContain("Meta CRAG");
    expect(challenge.officialUrl).toBe("https://www.aicrowd.com/challenges/meta-crag-mm-challenge-2025");
    expect(challenge.venueSlug).toBe("kdd");
    expect(challenge.venueYear).toBe(2025);
    expect(challenge.domains).toContain("Data Mining");

    // Real "Timeline" section: "Data Available: March 15, 2025, 23:55 UTC"
    expect(challenge.challengeStart?.value?.toISOString().slice(0, 10)).toBe("2025-03-15");
    // "Phase 1 Submission End Date: May 17, 2025, 23:55 UTC"
    expect(challenge.submissionDeadline?.value?.toISOString().slice(0, 10)).toBe("2025-05-17");
    // "Registration and Team Freeze Deadline: June 1, 2025, 23:55 UTC"
    expect(challenge.registrationDeadline?.value?.toISOString().slice(0, 10)).toBe("2025-06-01");
    // "Winner Public Announcement: August 5, 2025 (At KDD Cup Winners event)"
    expect(challenge.workshopDate?.value?.toISOString().slice(0, 10)).toBe("2025-08-05");
  });

  it("extracts multiple real 2026 tracks (title + URL per track) from the KDD Cup nav menu", async () => {
    stubFetchWithFixtures([{ match: "kdd2026.kdd.org", fixturePath: FIXTURE_2026 }]);

    const challenges = await kddCupAdapter.fetchChallenges(
      { year: 2026, url: "https://kdd2026.kdd.org/" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(2);

    const tencent = challenges.find((c) => c.name.includes("Tencent"));
    expect(tencent).toBeDefined();
    expect(tencent?.officialUrl).toBe("https://algo.qq.com/");
    expect(tencent?.venueYear).toBe(2026);
    expect(tencent?.externalKey).toBe("kdd-2026-tencent-uni-rec-challenge");

    const hkust = challenges.find((c) => c.name.includes("HKUST"));
    expect(hkust).toBeDefined();
    expect(hkust?.officialUrl).toBe("https://dataagent.top/");
    expect(hkust?.externalKey).toBe("kdd-2026-hkust-data-agents-challenge");

    for (const challenge of challenges) {
      expect(challenge.domains).toContain("Data Mining");
    }
  });
});
