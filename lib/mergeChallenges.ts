import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditLog,
  challengeDomains,
  challengeLinks,
  challengeSourceRecords,
  challengeTaskTags,
  challenges,
  fieldOverrides,
  slugRedirects,
} from "@/db/schema";
import { setFieldOverride } from "@/lib/overrides";

/**
 * Section 51 — Duplicate Merge. Pure database logic, deliberately kept out
 * of app/admin/actions.ts (a "use server" module) so it can be exercised
 * directly in integration tests without a Next.js request context —
 * revalidatePath/redirect require one and belong in the thin action
 * wrapper that calls this.
 *
 * Reassigns links/provenance/tags from `mergeId` onto `keepId`, preserves
 * any override `keepId` doesn't already have, redirects the old slug
 * (Section 52 — public URLs must not just disappear), and removes the
 * now-redundant duplicate row. Never called automatically (Section 17:
 * "do not auto-merge low-confidence cases") — only from an explicit admin
 * action.
 */
export async function mergeChallenges(keepId: string, mergeId: string, actor: string): Promise<void> {
  if (keepId === mergeId) return;

  const [keep] = await db.select().from(challenges).where(eq(challenges.id, keepId)).limit(1);
  const [merge] = await db.select().from(challenges).where(eq(challenges.id, mergeId)).limit(1);
  if (!keep || !merge) throw new Error("Both challenges must exist to merge");

  // Links: move any not already present on `keep` (by URL).
  const [keepLinks, mergeLinks] = await Promise.all([
    db.select().from(challengeLinks).where(eq(challengeLinks.challengeId, keepId)),
    db.select().from(challengeLinks).where(eq(challengeLinks.challengeId, mergeId)),
  ]);
  const keepUrls = new Set(keepLinks.map((l) => l.url));
  for (const link of mergeLinks) {
    if (keepUrls.has(link.url)) {
      await db.delete(challengeLinks).where(eq(challengeLinks.id, link.id));
    } else {
      await db.update(challengeLinks).set({ challengeId: keepId }).where(eq(challengeLinks.id, link.id));
      keepUrls.add(link.url);
    }
  }

  // Domains / task tags: move one row at a time, skipping ones `keep`
  // already has (a single batch UPDATE would violate the (challengeId,
  // domainId) primary key and roll back the whole statement on any overlap).
  const [keepDomainRows, mergeDomainRows] = await Promise.all([
    db.select().from(challengeDomains).where(eq(challengeDomains.challengeId, keepId)),
    db.select().from(challengeDomains).where(eq(challengeDomains.challengeId, mergeId)),
  ]);
  const keepDomainIds = new Set(keepDomainRows.map((d) => d.domainId));
  for (const row of mergeDomainRows) {
    if (!keepDomainIds.has(row.domainId)) {
      await db.insert(challengeDomains).values({ challengeId: keepId, domainId: row.domainId }).onConflictDoNothing();
    }
  }
  await db.delete(challengeDomains).where(eq(challengeDomains.challengeId, mergeId));

  const [keepTagRows, mergeTagRows] = await Promise.all([
    db.select().from(challengeTaskTags).where(eq(challengeTaskTags.challengeId, keepId)),
    db.select().from(challengeTaskTags).where(eq(challengeTaskTags.challengeId, mergeId)),
  ]);
  const keepTagIds = new Set(keepTagRows.map((t) => t.taskTagId));
  for (const row of mergeTagRows) {
    if (!keepTagIds.has(row.taskTagId)) {
      await db.insert(challengeTaskTags).values({ challengeId: keepId, taskTagId: row.taskTagId }).onConflictDoNothing();
    }
  }
  await db.delete(challengeTaskTags).where(eq(challengeTaskTags.challengeId, mergeId));

  // Provenance: every source record now points at the surviving challenge.
  await db.update(challengeSourceRecords).set({ challengeId: keepId }).where(eq(challengeSourceRecords.challengeId, mergeId));

  // Overrides: keep `keep`'s own overrides; adopt `merge`'s only for fields
  // `keep` doesn't already override (Section 9.11 priority still applies).
  const [keepOverrides, mergeOverrides] = await Promise.all([
    db.select().from(fieldOverrides).where(eq(fieldOverrides.challengeId, keepId)),
    db.select().from(fieldOverrides).where(eq(fieldOverrides.challengeId, mergeId)),
  ]);
  const keepFields = new Set(keepOverrides.map((o) => o.fieldName));
  for (const override of mergeOverrides) {
    if (!keepFields.has(override.fieldName)) {
      await setFieldOverride(keepId, override.fieldName, override.overrideValue, {
        reason: override.reason ?? undefined,
        createdBy: override.createdBy ?? actor,
      });
    }
  }
  await db.delete(fieldOverrides).where(eq(fieldOverrides.challengeId, mergeId));

  // Section 52 — the old public URL must redirect, not 404.
  await db
    .insert(slugRedirects)
    .values({ entityType: "challenge", oldSlug: merge.slug, newSlug: keep.slug })
    .onConflictDoNothing();

  await db.delete(challenges).where(eq(challenges.id, mergeId));

  await db.insert(auditLog).values({
    entityType: "challenge",
    entityId: keepId,
    action: "merge",
    fieldName: "merged_from",
    oldValue: merge.slug as never,
    newValue: keep.slug as never,
    actor,
  });
}
