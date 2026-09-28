import { and, asc, desc, eq, exists, ilike, inArray, or, sql as rawSql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  challengeDomains,
  challengeLinks,
  challenges,
  challengeSourceRecords,
  challengeTaskTags,
  domains,
  sourceSeries,
  taskTags,
  venues,
  type ChallengeStatus,
} from "@/db/schema";

export type ChallengeListItem = {
  id: string;
  slug: string;
  name: string;
  status: ChallengeStatus;
  venueName: string | null;
  venueSlug: string | null;
  venueYear: number | null;
  officialUrl: string;
  registrationDeadline: Date | null;
  submissionDeadline: Date | null;
  challengeEnd: Date | null;
  evaluationEnd: Date | null;
  workshopDate: Date | null;
  lastVerifiedAt: Date;
  domains: string[];
};

const listColumns = {
  id: challenges.id,
  slug: challenges.slug,
  name: challenges.name,
  status: challenges.status,
  venueName: venues.name,
  venueSlug: venues.slug,
  venueYear: challenges.venueYear,
  officialUrl: challenges.officialUrl,
  registrationDeadline: challenges.registrationDeadline,
  submissionDeadline: challenges.submissionDeadline,
  challengeEnd: challenges.challengeEnd,
  evaluationEnd: challenges.evaluationEnd,
  workshopDate: challenges.workshopDate,
  lastVerifiedAt: challenges.lastVerifiedAt,
};

async function attachDomains(rows: Omit<ChallengeListItem, "domains">[]): Promise<ChallengeListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const domainRows = await db
    .select({ challengeId: challengeDomains.challengeId, name: domains.name })
    .from(challengeDomains)
    .innerJoin(domains, eq(challengeDomains.domainId, domains.id))
    .where(inArray(challengeDomains.challengeId, ids));

  const byChallenge = new Map<string, string[]>();
  for (const row of domainRows) {
    const list = byChallenge.get(row.challengeId) ?? [];
    list.push(row.name);
    byChallenge.set(row.challengeId, list);
  }

  return rows.map((r) => ({ ...r, domains: byChallenge.get(r.id) ?? [] }));
}

export type ChallengeFilters = {
  status?: ChallengeStatus;
  domainSlug?: string;
  venueSlug?: string;
  year?: number;
  query?: string;
};

function buildWhereClause(filters: ChallengeFilters) {
  const conditions = [eq(challenges.isHidden, false), eq(challenges.isActive, true)];

  if (filters.status) conditions.push(eq(challenges.status, filters.status));
  if (filters.venueSlug) conditions.push(eq(venues.slug, filters.venueSlug));
  if (filters.year) conditions.push(eq(challenges.venueYear, filters.year));
  if (filters.domainSlug) {
    conditions.push(
      exists(
        db
          .select({ one: rawSql`1` })
          .from(challengeDomains)
          .innerJoin(domains, eq(challengeDomains.domainId, domains.id))
          .where(and(eq(challengeDomains.challengeId, challenges.id), eq(domains.slug, filters.domainSlug!))),
      ),
    );
  }
  if (filters.query) {
    // Section 27 — full-text search over challenge name (generated
    // tsvector column) plus venue name / task tag name via joins/exists.
    const tsQuery = filters.query
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => `${term}:*`)
      .join(" & ");

    conditions.push(
      or(
        tsQuery ? rawSql`"challenges"."search_vector" @@ to_tsquery('english', ${tsQuery})` : rawSql`false`,
        ilike(venues.name, `%${filters.query}%`),
        exists(
          db
            .select({ one: rawSql`1` })
            .from(challengeTaskTags)
            .innerJoin(taskTags, eq(challengeTaskTags.taskTagId, taskTags.id))
            .where(and(eq(challengeTaskTags.challengeId, challenges.id), ilike(taskTags.name, `%${filters.query}%`))),
        ),
      )!,
    );
  }

  return and(...conditions);
}

/**
 * Section 23/29 — homepage sections with their required default sort:
 * open (nearest milestone first), upcoming (earliest start first), recently
 * closed (most recently closed first).
 */
export async function getHomepageSections(filters: ChallengeFilters) {
  const baseWhere = buildWhereClause(filters);

  const openRows = await db
    .select(listColumns)
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(baseWhere, eq(challenges.status, "open")))
    .orderBy(
      asc(rawSql`coalesce(${challenges.submissionDeadline}, ${challenges.registrationDeadline}, ${challenges.challengeEnd})`),
    )
    .limit(60);

  const upcomingRows = await db
    .select(listColumns)
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(baseWhere, eq(challenges.status, "upcoming")))
    .orderBy(asc(rawSql`coalesce(${challenges.registrationStart}, ${challenges.challengeStart})`))
    .limit(60);

  const closedRows = await db
    .select(listColumns)
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(baseWhere, eq(challenges.status, "closed")))
    .orderBy(desc(rawSql`coalesce(${challenges.evaluationEnd}, ${challenges.challengeEnd}, ${challenges.submissionDeadline})`))
    .limit(30);

  const [open, upcoming, closed] = await Promise.all([
    attachDomains(openRows),
    attachDomains(upcomingRows),
    attachDomains(closedRows),
  ]);

  return { open, upcoming, closed };
}

export async function listAllVenues() {
  return db.select().from(venues).where(eq(venues.isActive, true)).orderBy(asc(venues.name));
}

export async function listAllDomains() {
  return db.select().from(domains).orderBy(asc(domains.name));
}

export async function listChallengeYears(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ year: challenges.venueYear })
    .from(challenges)
    .where(and(eq(challenges.isHidden, false)));
  return rows.map((r) => r.year).filter((y): y is number => y !== null).sort((a, b) => b - a);
}

export async function getChallengeBySlug(slug: string) {
  const [challenge] = await db
    .select()
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(eq(challenges.slug, slug), eq(challenges.isHidden, false)))
    .limit(1);

  if (!challenge) return null;

  const links = await db
    .select()
    .from(challengeLinks)
    .where(eq(challengeLinks.challengeId, challenge.challenges.id))
    .orderBy(desc(challengeLinks.isPrimary));

  const domainRows = await db
    .select({ name: domains.name, slug: domains.slug })
    .from(challengeDomains)
    .innerJoin(domains, eq(challengeDomains.domainId, domains.id))
    .where(eq(challengeDomains.challengeId, challenge.challenges.id));

  const taskTagRows = await db
    .select({ name: taskTags.name, slug: taskTags.slug })
    .from(challengeTaskTags)
    .innerJoin(taskTags, eq(challengeTaskTags.taskTagId, taskTags.id))
    .where(eq(challengeTaskTags.challengeId, challenge.challenges.id));

  const sourceRecords = await db
    .select({
      sourceUrl: challengeSourceRecords.sourceUrl,
      lastSeenAt: challengeSourceRecords.lastSeenAt,
      sourceName: sourceSeries.name,
    })
    .from(challengeSourceRecords)
    .innerJoin(sourceSeries, eq(challengeSourceRecords.sourceSeriesId, sourceSeries.id))
    .where(eq(challengeSourceRecords.challengeId, challenge.challenges.id));

  return {
    challenge: challenge.challenges,
    venue: challenge.venues,
    links,
    domains: domainRows,
    taskTags: taskTagRows,
    sourceRecords,
  };
}

export async function getVenueBySlug(slug: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.slug, slug)).limit(1);
  if (!venue) return null;

  const rows = await db
    .select(listColumns)
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(eq(venues.id, venue.id), eq(challenges.isHidden, false)))
    .orderBy(desc(challenges.venueYear));

  const withDomains = await attachDomains(rows);
  const byYear = new Map<number, ChallengeListItem[]>();
  for (const row of withDomains) {
    const year = row.venueYear ?? 0;
    const list = byYear.get(year) ?? [];
    list.push(row);
    byYear.set(year, list);
  }

  return { venue, byYear: [...byYear.entries()].sort((a, b) => b[0] - a[0]) };
}

/**
 * Section 31 — calendar agenda: every future milestone across all visible
 * challenges, flattened and sorted chronologically.
 */
export async function getUpcomingMilestones() {
  const rows = await db
    .select(listColumns)
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(and(eq(challenges.isHidden, false), eq(challenges.isActive, true)));

  return attachDomains(rows);
}

export async function getChallengeCountByStatus() {
  const rows = await db
    .select({ status: challenges.status, count: rawSql<number>`count(*)::int` })
    .from(challenges)
    .where(and(eq(challenges.isHidden, false), eq(challenges.isActive, true)))
    .groupBy(challenges.status);
  return rows;
}
