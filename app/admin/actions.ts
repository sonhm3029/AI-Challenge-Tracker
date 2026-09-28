"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, challengeDomains, challengeLinks, challenges, sourceSeries, type ChallengeStatus } from "@/db/schema";
import { buildChallengeSlug } from "@/lib/slug";
import { getVenueIdBySlug } from "@/lib/taxonomy";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/adminAuth";
import { verifyAdminPassword } from "@/lib/adminAuth.server";
import { setFieldOverride, clearFieldOverride } from "@/lib/overrides";
import { mergeChallenges } from "@/lib/mergeChallenges";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import { runSourceSafely } from "@/jobs/updateAllSources";
import { getAdapter } from "@/scrapers/registry";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "admin-actions" });
const ADMIN_ACTOR = "admin-console";

async function writeAuditLog(entityType: string, entityId: string, action: string, fieldName?: string, oldValue?: unknown, newValue?: unknown) {
  await db.insert(auditLog).values({
    entityType,
    entityId,
    action,
    fieldName,
    oldValue: oldValue === undefined ? null : (oldValue as never),
    newValue: newValue === undefined ? null : (newValue as never),
    actor: ADMIN_ACTOR,
  });
}

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    redirect("/admin/login?error=1");
  }
  const token = await createAdminSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/admin");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}

const EDITABLE_TEXT_FIELDS = ["name", "shortName", "description", "officialUrl", "hostPlatform", "timezone"] as const;
const EDITABLE_DATE_FIELDS = [
  "registrationStart",
  "registrationDeadline",
  "challengeStart",
  "challengeEnd",
  "submissionDeadline",
  "evaluationStart",
  "evaluationEnd",
  "workshopDate",
] as const;

/**
 * Section 22/9.11 — every manual edit to a scraped field creates/updates a
 * field_override (so a future crawl can never silently overwrite it) AND
 * writes the value directly onto the challenge row (so the public site
 * reflects it immediately, without waiting for the next crawl).
 */
export async function updateChallengeAction(challengeId: string, formData: FormData) {
  const [existing] = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
  if (!existing) throw new Error("Challenge not found");

  const updates: Record<string, unknown> = {};

  for (const field of EDITABLE_TEXT_FIELDS) {
    const raw = formData.get(field);
    if (raw === null) continue;
    const value = String(raw).trim() || null;
    if (value !== (existing as unknown as Record<string, unknown>)[field]) {
      updates[field] = value;
      await setFieldOverride(challengeId, field, value, { createdBy: ADMIN_ACTOR });
      await writeAuditLog("challenge", challengeId, "edit", field, (existing as unknown as Record<string, unknown>)[field], value);
    }
  }

  for (const field of EDITABLE_DATE_FIELDS) {
    const raw = formData.get(field);
    if (raw === null) continue;
    const text = String(raw).trim();
    const value = text ? parseHumanDate(text).value : null;
    const oldValue = (existing as unknown as Record<string, unknown>)[field] as Date | null;
    const changed = (value?.getTime() ?? null) !== (oldValue?.getTime() ?? null);
    if (changed) {
      updates[field] = value;
      await setFieldOverride(challengeId, field, value ? value.toISOString() : null, { createdBy: ADMIN_ACTOR });
      await writeAuditLog("challenge", challengeId, "edit", field, oldValue, value);
    }
  }

  const status = formData.get("status");
  if (status && status !== existing.status) {
    updates.status = status as ChallengeStatus;
    await setFieldOverride(challengeId, "status", status, { createdBy: ADMIN_ACTOR });
    await writeAuditLog("challenge", challengeId, "edit", "status", existing.status, status);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(challenges).set({ ...updates, updatedAt: new Date() } as never).where(eq(challenges.id, challengeId));
  }

  revalidatePath(`/admin/challenges/${challengeId}`);
  revalidatePath(`/challenges/${existing.slug}`);
  revalidatePath("/");
}

/** Section 22 — "edit tags". Domains are a small curated set (Section 9.6),
 * so a full replace-on-save is simpler and safer than incremental diffing. */
export async function updateChallengeDomainsAction(challengeId: string, formData: FormData) {
  const selected = formData.getAll("domainIds").map(String);
  await db.delete(challengeDomains).where(eq(challengeDomains.challengeId, challengeId));
  for (const domainId of selected) {
    await db.insert(challengeDomains).values({ challengeId, domainId }).onConflictDoNothing();
  }
  await writeAuditLog("challenge", challengeId, "edit", "domains", undefined, selected);
  revalidatePath(`/admin/challenges/${challengeId}`);
  revalidatePath("/");
}

/**
 * Section 51 — Duplicate Merge. Reassigns links/provenance/tags from
 * `mergeId` onto `keepId`, preserves any override `keepId` doesn't already
 * have, redirects the old slug (Section 52 — public URLs must not just
 * disappear), and removes the now-redundant duplicate row. Never called
 * automatically (Section 17: "do not auto-merge low-confidence cases") —
 * only from an explicit admin action.
 */
export async function mergeChallengesAction(keepId: string, mergeId: string) {
  const [keep] = await db.select().from(challenges).where(eq(challenges.id, keepId)).limit(1);
  await mergeChallenges(keepId, mergeId, ADMIN_ACTOR);

  revalidatePath("/admin/challenges");
  if (keep) revalidatePath(`/challenges/${keep.slug}`);
  revalidatePath("/");
}

export async function clearOverrideAction(challengeId: string, fieldName: string) {
  await clearFieldOverride(challengeId, fieldName);
  await writeAuditLog("challenge", challengeId, "clear_override", fieldName);
  revalidatePath(`/admin/challenges/${challengeId}`);
}

export async function setHiddenAction(challengeId: string, isHidden: boolean) {
  await db.update(challenges).set({ isHidden, updatedAt: new Date() }).where(eq(challenges.id, challengeId));
  await writeAuditLog("challenge", challengeId, isHidden ? "hide" : "unhide");
  revalidatePath("/admin/challenges");
  revalidatePath("/");
}

export async function setArchivedAction(challengeId: string, isActive: boolean) {
  await db.update(challenges).set({ isActive, updatedAt: new Date() }).where(eq(challenges.id, challengeId));
  await writeAuditLog("challenge", challengeId, isActive ? "unarchive" : "archive");
  revalidatePath("/admin/challenges");
  revalidatePath("/");
}

/**
 * Section 22/50 — Manual Challenge Creation, for irregular sources or
 * newly-announced challenges a crawler doesn't cover yet.
 */
export async function createChallengeAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const officialUrl = String(formData.get("officialUrl") ?? "").trim();
  if (!name || !officialUrl) throw new Error("Name and official URL are required");

  const venueSlug = String(formData.get("venueSlug") ?? "").trim() || undefined;
  const venueYearRaw = String(formData.get("venueYear") ?? "").trim();
  const venueYear = venueYearRaw ? Number(venueYearRaw) : undefined;
  const venueId = venueSlug ? await getVenueIdBySlug(venueSlug) : undefined;

  const slug = buildChallengeSlug(name, venueYear);
  const now = new Date();

  const [inserted] = await db
    .insert(challenges)
    .values({
      slug,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      venueId,
      venueYear,
      status: "unknown",
      officialUrl,
      firstSeenAt: now,
      lastSeenAt: now,
      lastVerifiedAt: now,
      isManuallyCreated: true,
    })
    .returning({ id: challenges.id });

  await db.insert(challengeLinks).values({ challengeId: inserted.id, label: "Official website", url: officialUrl, linkType: "official", isPrimary: true });
  await writeAuditLog("challenge", inserted.id, "create");

  revalidatePath("/admin/challenges");
  revalidatePath("/");
  redirect(`/admin/challenges/${inserted.id}`);
}

export async function toggleSourceEnabledAction(sourceId: string, enabled: boolean) {
  await db.update(sourceSeries).set({ enabled, updatedAt: new Date() }).where(eq(sourceSeries.id, sourceId));
  await writeAuditLog("source_series", sourceId, enabled ? "enable" : "disable");
  revalidatePath("/admin/sources");
}

/**
 * Section 22 — "manually trigger crawl". Runs synchronously within the
 * request; acceptable at this scale (Section 58: hundreds of requests per
 * day, one source at a time) and keeps the admin tool simple (Section 2.5)
 * rather than standing up a job queue for what is an occasional manual action.
 */
export async function triggerCrawlAction(sourceId: string) {
  const [source] = await db.select().from(sourceSeries).where(eq(sourceSeries.id, sourceId)).limit(1);
  if (!source) throw new Error("Source not found");

  try {
    getAdapter(source.adapterName);
  } catch {
    log.warn("triggerCrawlAction: no adapter registered", { source: source.slug });
    revalidatePath("/admin/sources");
    return;
  }

  await runSourceSafely(source);
  revalidatePath("/admin/sources");
  revalidatePath("/admin/crawl-runs");
  revalidatePath("/");
}
