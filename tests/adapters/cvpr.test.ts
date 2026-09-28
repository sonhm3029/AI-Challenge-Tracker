import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cvprAdapter } from "@/scrapers/cvpr";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const WORKSHOPS_FIXTURE = path.join(__dirname, "../fixtures/cvpr/2026-workshops.html");
const UG2_FIXTURE = path.join(__dirname, "../fixtures/cvpr/ug2-challenge.html");
const GIGABRAIN_FIXTURE = path.join(__dirname, "../fixtures/cvpr/gigabrain-challenge.html");
const VIZWIZ_FIXTURE = path.join(__dirname, "../fixtures/cvpr/vizwiz-challenge.html");

const ROUTES = [
  { match: "cvpr.thecvf.com/Conferences/2026/Workshops", fixturePath: WORKSHOPS_FIXTURE },
  { match: "cvpr2026ug2challenge.github.io", fixturePath: UG2_FIXTURE },
  { match: "gigaai-research.github.io/GigaBrain-Challenge-2026", fixturePath: GIGABRAIN_FIXTURE },
  { match: "vizwiz.org/workshops/2026-vizwiz-grand-challenge-workshop", fixturePath: VIZWIZ_FIXTURE },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cvprAdapter", () => {
  it("discovers the 2026 Workshops-page edition via the predictable URL", async () => {
    stubFetchWithFixtures(ROUTES);

    const editions = await cvprAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    expect(editions.some((e) => e.year === 2026)).toBe(true);
    const edition2026 = editions.find((e) => e.year === 2026)!;
    expect(edition2026.url).toContain("cvpr.thecvf.com/Conferences/2026/Workshops");
  });

  it("does not discover years whose Workshops page 404s (e.g. 2025)", async () => {
    stubFetchWithFixtures(ROUTES);

    const editions = await cvprAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    expect(editions.some((e) => e.year === 2025)).toBe(false);
  });

  it("finds exactly the three real challenge-affiliated workshops via conference-navigation discovery, filtering out non-challenge workshops", async () => {
    stubFetchWithFixtures(ROUTES);

    const challenges = await cvprAdapter.fetchChallenges(
      { year: 2026, url: "https://cvpr.thecvf.com/Conferences/2026/Workshops" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    expect(challenges).toHaveLength(3);
    const names = challenges.map((c) => c.name);
    expect(names.some((n) => /UG2\+/i.test(n))).toBe(true);
    expect(names.some((n) => /GigaBrain/i.test(n))).toBe(true);
    expect(names.some((n) => /VizWiz/i.test(n))).toBe(true);
    // Decoy workshops present in the fixture (not challenges) must be excluded.
    expect(names.some((n) => /Computational Cameras and Displays/i.test(n))).toBe(false);
    expect(names.some((n) => /GenAI for Storytelling/i.test(n))).toBe(false);
    expect(names.some((n) => /Sign Language Recognition/i.test(n))).toBe(false);
  });

  it("extracts official URL, venue, domains and links for the UG2+ challenge", async () => {
    stubFetchWithFixtures(ROUTES);

    const challenges = await cvprAdapter.fetchChallenges(
      { year: 2026, url: "https://cvpr.thecvf.com/Conferences/2026/Workshops" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    const ug2 = challenges.find((c) => /UG2\+/i.test(c.name))!;
    expect(ug2).toBeDefined();
    expect(ug2.officialUrl).toBe("https://cvpr2026ug2challenge.github.io/");
    expect(ug2.venueSlug).toBe("cvpr");
    expect(ug2.venueYear).toBe(2026);
    expect(ug2.domains).toContain("Computer Vision");
    expect(ug2.externalKey).toBe("cvpr-2026-the-8th-ug2-workshop-and-challenge-bridging-the-gap-between-computational-photography-and-visual-perception");
    expect(ug2.links?.some((l) => l.type === "platform" && /codabench/i.test(l.url))).toBe(true);
  });

  it("extracts a challenge-end date for GigaBrain Challenge 2026", async () => {
    stubFetchWithFixtures(ROUTES);

    const challenges = await cvprAdapter.fetchChallenges(
      { year: 2026, url: "https://cvpr.thecvf.com/Conferences/2026/Workshops" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    const gigabrain = challenges.find((c) => /GigaBrain/i.test(c.name))!;
    expect(gigabrain).toBeDefined();
    expect(gigabrain.officialUrl).toBe("https://gigaai-research.github.io/GigaBrain-Challenge-2026");
    expect(gigabrain.domains).toContain("Computer Vision");
    // "Competition Ends" / "May 15" on the page, year inferred from the edition (2026).
    expect(gigabrain.challengeEnd?.value?.toISOString().slice(0, 10)).toBe("2026-05-15");
    expect(gigabrain.links?.some((l) => /huggingface\.co/i.test(l.url))).toBe(true);
  });

  it("extracts a workshop date for the VizWiz Grand Challenge and a hostPlatform from its EvalAI link", async () => {
    stubFetchWithFixtures(ROUTES);

    const challenges = await cvprAdapter.fetchChallenges(
      { year: 2026, url: "https://cvpr.thecvf.com/Conferences/2026/Workshops" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    const vizwiz = challenges.find((c) => /VizWiz/i.test(c.name))!;
    expect(vizwiz).toBeDefined();
    expect(vizwiz.officialUrl).toBe("https://vizwiz.org/workshops/2026-vizwiz-grand-challenge-workshop");
    expect(vizwiz.domains).toContain("Computer Vision");
    // "Half-day Workshop: Thursday, June 4" — year inferred from the edition (2026).
    expect(vizwiz.workshopDate?.value?.toISOString().slice(0, 10)).toBe("2026-06-04");
    expect(vizwiz.hostPlatform).toBe("EvalAI");
  });
});
