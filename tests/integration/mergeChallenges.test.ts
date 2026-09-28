import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import {
  challengeDomains,
  challengeLinks,
  challengeSourceRecords,
  challenges,
  domains,
  fieldOverrides,
  slugRedirects,
  sourceSeries,
} from "@/db/schema";
import { mergeChallenges } from "@/lib/mergeChallenges";

/**
 * Section 51 — Duplicate Merge. Verifies links, domains, provenance, and
 * overrides all survive a merge onto the surviving challenge, the losing
 * challenge is removed, and its old slug redirects to the survivor
 * (Section 52).
 */
describe("mergeChallenges", () => {
  let sourceId: string;
  let keepId: string;
  let mergeId: string;
  let domainId: string;
  let sharedDomainId: string;

  beforeAll(async () => {
    const [source] = await db
      .insert(sourceSeries)
      .values({ name: "Merge Test Source", slug: "merge-test-source", adapterName: "wsdm", rootUrl: "https://example.invalid/", enabled: false })
      .onConflictDoUpdate({ target: sourceSeries.slug, set: { name: "Merge Test Source" } })
      .returning({ id: sourceSeries.id });
    sourceId = source.id;

    const [irDomain] = await db.select().from(domains).where(eq(domains.slug, "information-retrieval")).limit(1);
    const [recDomain] = await db.select().from(domains).where(eq(domains.slug, "recommender-systems")).limit(1);
    domainId = irDomain.id;
    sharedDomainId = recDomain.id;

    const now = new Date();
    const [keep] = await db
      .insert(challenges)
      .values({
        slug: "merge-test-keep",
        name: "Merge Test Challenge",
        status: "unknown",
        officialUrl: "https://example.invalid/keep",
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
      })
      .returning({ id: challenges.id });
    keepId = keep.id;

    const [merge] = await db
      .insert(challenges)
      .values({
        slug: "merge-test-duplicate",
        name: "Merge Test Challenge (dup)",
        status: "unknown",
        officialUrl: "https://example.invalid/dup",
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
      })
      .returning({ id: challenges.id });
    mergeId = merge.id;

    await db.insert(challengeLinks).values([
      { challengeId: keepId, label: "Official", url: "https://example.invalid/keep", linkType: "official", isPrimary: true },
      { challengeId: mergeId, label: "GitHub", url: "https://github.com/example/dup", linkType: "github" },
    ]);

    // keep already has "recommender-systems"; merge has both "recommender-systems"
    // (duplicate — should be dropped, not violate the PK) and "information-retrieval".
    await db.insert(challengeDomains).values([
      { challengeId: keepId, domainId: sharedDomainId },
      { challengeId: mergeId, domainId: sharedDomainId },
      { challengeId: mergeId, domainId },
    ]);

    await db.insert(challengeSourceRecords).values({
      challengeId: mergeId,
      sourceSeriesId: sourceId,
      sourceUrl: "https://example.invalid/dup-source",
      contentHash: "abc123",
    });

    await db.insert(fieldOverrides).values({
      challengeId: mergeId,
      fieldName: "description",
      overrideValue: "kept from the duplicate",
    });
  });

  afterAll(async () => {
    await db.delete(challenges).where(eq(challenges.id, keepId));
    await db.delete(challenges).where(eq(challenges.id, mergeId));
    await db.delete(slugRedirects).where(eq(slugRedirects.oldSlug, "merge-test-duplicate"));
    await db.delete(sourceSeries).where(eq(sourceSeries.id, sourceId));
  });

  it("moves links, domains, provenance, and non-conflicting overrides onto the survivor, then removes the duplicate", async () => {
    await mergeChallenges(keepId, mergeId, "test-actor");

    const survivorGone = await db.select().from(challenges).where(eq(challenges.id, mergeId));
    expect(survivorGone).toHaveLength(0);

    const links = await db.select().from(challengeLinks).where(eq(challengeLinks.challengeId, keepId));
    expect(links.map((l) => l.url).sort()).toEqual(["https://example.invalid/keep", "https://github.com/example/dup"].sort());

    const domainRows = await db.select().from(challengeDomains).where(eq(challengeDomains.challengeId, keepId));
    expect(domainRows.map((d) => d.domainId).sort()).toEqual([domainId, sharedDomainId].sort());

    const sourceRecords = await db.select().from(challengeSourceRecords).where(eq(challengeSourceRecords.challengeId, keepId));
    expect(sourceRecords.some((r) => r.sourceUrl === "https://example.invalid/dup-source")).toBe(true);

    const overrides = await db.select().from(fieldOverrides).where(eq(fieldOverrides.challengeId, keepId));
    expect(overrides.some((o) => o.fieldName === "description")).toBe(true);

    const redirect = await db.select().from(slugRedirects).where(eq(slugRedirects.oldSlug, "merge-test-duplicate"));
    expect(redirect[0]?.newSlug).toBe("merge-test-keep");
  });
});
