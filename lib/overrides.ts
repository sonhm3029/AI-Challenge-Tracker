import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { fieldOverrides } from "@/db/schema";

/**
 * Section 9.11 — resolution priority is manual override > latest scraped
 * value > existing stored value. This loads the override map for a
 * challenge so the crawler can skip writing any field an admin has pinned.
 */
export async function getFieldOverrides(challengeId: string): Promise<Record<string, unknown>> {
  const rows = await db.select().from(fieldOverrides).where(eq(fieldOverrides.challengeId, challengeId));
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    map[row.fieldName] = row.overrideValue;
  }
  return map;
}

/**
 * Removes any key present in `overrides` from `proposedUpdate` so a crawler
 * write can never silently clobber a manual correction.
 */
export function stripOverriddenFields<T extends Record<string, unknown>>(
  proposedUpdate: T,
  overrides: Record<string, unknown>,
): Partial<T> {
  const result: Partial<T> = { ...proposedUpdate };
  for (const field of Object.keys(overrides)) {
    if (field in result) {
      delete result[field as keyof T];
    }
  }
  return result;
}

export async function setFieldOverride(
  challengeId: string,
  fieldName: string,
  value: unknown,
  options: { reason?: string; createdBy: string },
) {
  await db
    .insert(fieldOverrides)
    .values({
      challengeId,
      fieldName,
      overrideValue: value as never,
      reason: options.reason,
      createdBy: options.createdBy,
    })
    .onConflictDoUpdate({
      target: [fieldOverrides.challengeId, fieldOverrides.fieldName],
      set: { overrideValue: value as never, reason: options.reason, createdBy: options.createdBy, updatedAt: new Date() },
    });
}

export async function clearFieldOverride(challengeId: string, fieldName: string) {
  await db
    .delete(fieldOverrides)
    .where(and(eq(fieldOverrides.challengeId, challengeId), eq(fieldOverrides.fieldName, fieldName)));
}
