import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { challenges, sourceSeries, venues } from "@/db/schema";
import { wsdmCupAdapter } from "@/scrapers/wsdm";
import { processScrapedChallenge, persistEdition } from "@/jobs/updateSource";
import { getChallengeBySlug } from "@/lib/queries";
import { stubFetchWithFixtures } from "@/tests/fixtures/serveFixture";

const FIXTURE = path.join(__dirname, "../fixtures/wsdm/2026.html");
const TEST_SOURCE_SLUG = "integration-test-wsdm";

/**
 * Section 45 — Integration Tests: scrape fixture -> normalize -> dedupe ->
 * upsert -> retrieve public challenge, against a real (test-only) Postgres
 * database. Requires DATABASE_URL to point at a disposable test DB
 * (tests/setupEnv.ts defaults it to challenge_tracker_test — never the
 * production database, per Section 61).
 */
describe("upsert pipeline (scrape -> normalize -> dedupe -> upsert -> retrieve)", () => {
  let testSourceSeriesId: string;
  let insertedChallengeId: string | undefined;

  beforeAll(async () => {
    const [venue] = await db.select().from(venues).where(eq(venues.slug, "wsdm")).limit(1);
    if (!venue) throw new Error("Expected 'wsdm' venue to be seeded — run `npm run db:seed` against the test database first.");

    const [source] = await db
      .insert(sourceSeries)
      .values({
        name: "Integration Test WSDM",
        slug: TEST_SOURCE_SLUG,
        venueId: venue.id,
        adapterName: "wsdm",
        rootUrl: "https://example.invalid/",
        enabled: false,
      })
      .onConflictDoUpdate({ target: sourceSeries.slug, set: { name: "Integration Test WSDM" } })
      .returning({ id: sourceSeries.id });
    testSourceSeriesId = source.id;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    if (insertedChallengeId) {
      await db.delete(challenges).where(eq(challenges.id, insertedChallengeId));
    }
    await db.delete(sourceSeries).where(eq(sourceSeries.id, testSourceSeriesId));
  });

  it("runs the full pipeline and the record is retrievable exactly as scraped", async () => {
    stubFetchWithFixtures([{ match: "wsdmcup-2026.github.io", fixturePath: FIXTURE }]);

    const [edition] = await wsdmCupAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });
    const [scraped] = await wsdmCupAdapter.fetchChallenges(edition, { now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    const [testSource] = await db.select().from(sourceSeries).where(eq(sourceSeries.id, testSourceSeriesId)).limit(1);
    const sourceEditionId = await persistEdition(testSourceSeriesId, edition);

    const result = await processScrapedChallenge({ raw: scraped, sourceSeries: testSource, sourceEditionId });
    expect(result.outcome).toBe("insert");
    insertedChallengeId = result.challengeId;

    const [insertedRow] = await db.select().from(challenges).where(eq(challenges.id, result.challengeId!)).limit(1);
    const retrieved = await getChallengeBySlug(insertedRow.slug);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.challenge.name).toContain("WSDM Cup 2026");
    expect(retrieved!.challenge.officialUrl).toBe("https://wsdmcup-2026.github.io/");
    expect(retrieved!.challenge.venueYear).toBe(2026);
    expect(retrieved!.venue?.slug).toBe("wsdm");
    expect(retrieved!.links.some((l) => l.linkType === "official")).toBe(true);
    expect(retrieved!.domains.some((d) => d.name === "Information Retrieval")).toBe(true);
  });

  it("is idempotent: re-running the same scrape leaves the record unchanged, not duplicated", async () => {
    stubFetchWithFixtures([{ match: "wsdmcup-2026.github.io", fixturePath: FIXTURE }]);

    const [edition] = await wsdmCupAdapter.discoverEditions({ now: new Date("2026-09-28T00:00:00Z"), dryRun: false });
    const [scraped] = await wsdmCupAdapter.fetchChallenges(edition, { now: new Date("2026-09-28T00:00:00Z"), dryRun: false });

    const [testSource] = await db.select().from(sourceSeries).where(eq(sourceSeries.id, testSourceSeriesId)).limit(1);
    const sourceEditionId = await persistEdition(testSourceSeriesId, edition);

    const before = await db.select().from(challenges).where(eq(challenges.officialUrl, scraped.officialUrl));
    const result = await processScrapedChallenge({ raw: scraped, sourceSeries: testSource, sourceEditionId });
    const after = await db.select().from(challenges).where(eq(challenges.officialUrl, scraped.officialUrl));

    expect(result.outcome).toBe("unchanged");
    expect(result.challengeId).toBe(insertedChallengeId);
    expect(after).toHaveLength(before.length);
    expect(after).toHaveLength(1);
  });
});
