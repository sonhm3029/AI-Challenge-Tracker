import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { semevalAdapter } from "@/scrapers/semeval";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE_HOMEPAGE = path.join(__dirname, "../fixtures/semeval/index.html");
const FIXTURE_2025_INDEX = path.join(__dirname, "../fixtures/semeval/2025.html");
const FIXTURE_2025_TASKS = path.join(__dirname, "../fixtures/semeval/2025-tasks.html");

// Order matters: stubFetchWithFixtures matches the first route whose
// `match` substring is found in the requested URL, so the more specific
// routes (tasks.html, then the year's own index page) must be listed
// before the bare homepage route, which is a substring of both.
const ROUTES = [
  { match: "semeval.github.io/SemEval2025/tasks.html", fixturePath: FIXTURE_2025_TASKS },
  { match: "semeval.github.io/SemEval2025", fixturePath: FIXTURE_2025_INDEX },
  { match: "semeval.github.io/", fixturePath: FIXTURE_HOMEPAGE },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("semevalAdapter", () => {
  it("discovers yearly editions from the stable series homepage", async () => {
    stubFetchWithFixtures(ROUTES);

    const editions = await semevalAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    // The real homepage fixture links SemEval-2020 through SemEval-2027;
    // only the current semeval.github.io/SemEvalYYYY naming convention is
    // recognized (SemEval-2020 lives on a different domain entirely).
    expect(editions.some((e) => e.year === 2025)).toBe(true);
    expect(editions.some((e) => e.year === 2020)).toBe(false);

    const edition2025 = editions.find((e) => e.year === 2025)!;
    expect(edition2025.url).toContain("semeval.github.io/SemEval2025");
  });

  it("extracts every task, its official URL, and the shared yearly timeline from the fixture", async () => {
    stubFetchWithFixtures(ROUTES);

    const challenges = await semevalAdapter.fetchChallenges(
      { year: 2025, url: "https://semeval.github.io/SemEval2025/" },
      { now: new Date("2026-09-28T00:00:00Z"), dryRun: false },
    );

    // The real SemEval-2025 tasks.html page lists 11 tasks (confirmed by
    // the homepage's own "11 TASKS" summary).
    expect(challenges).toHaveLength(11);

    const task1 = challenges.find((c) => c.externalKey === "semeval-2025-task-1")!;
    expect(task1).toBeDefined();
    expect(task1.name).toContain("Task 1");
    expect(task1.name).toContain("ADMIRE");
    expect(task1.officialUrl).toBe("https://semeval2025-task1.github.io/");
    expect(task1.venueSlug).toBe("semeval");
    expect(task1.venueYear).toBe(2025);
    expect(task1.domains).toContain("NLP");
    expect(task1.domains).toContain("Multimodal");

    const task11 = challenges.find((c) => c.externalKey === "semeval-2025-task-11")!;
    expect(task11.name).toContain("Bridging the Gap in Text-Based Emotion Detection");
    expect(task11.officialUrl).toBe("https://github.com/emotion-analysis-project/SemEval2025-task11");

    // The "Important dates" timeline is published once for the whole year
    // (not per task) and should be applied identically to every task.
    for (const challenge of challenges) {
      expect(challenge.submissionDeadline?.value?.toISOString().slice(0, 10)).toBe("2025-02-28");
      expect(challenge.evaluationStart?.value?.toISOString().slice(0, 10)).toBe("2025-01-10");
      expect(challenge.evaluationEnd?.value?.toISOString().slice(0, 10)).toBe("2025-01-31");
      expect(challenge.workshopDate?.value?.toISOString().slice(0, 10)).toBe("2025-08-01");
      expect(challenge.challengeStart?.value?.getUTCFullYear()).toBe(2024);
    }
  });
});
