import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// 9.1 venues
// ---------------------------------------------------------------------------
export const venues = pgTable("venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  homepageUrl: text("homepage_url"),
  shortName: text("short_name"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 9.2 source_series
// ---------------------------------------------------------------------------
export const sourceSeries = pgTable("source_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),

  venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),

  adapterName: text("adapter_name").notNull(),
  rootUrl: text("root_url").notNull(),

  enabled: boolean("enabled").notNull().default(true),

  discoveryStrategy: text("discovery_strategy"),
  configJson: jsonb("config_json").$type<Record<string, unknown>>(),

  crawlIntervalHours: integer("crawl_interval_hours").notNull().default(24),

  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastError: text("last_error"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 9.3 source_editions
// ---------------------------------------------------------------------------
export const sourceEditions = pgTable(
  "source_editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSeriesId: uuid("source_series_id")
      .notNull()
      .references(() => sourceSeries.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    url: text("url").notNull(),

    status: text("status").notNull().default("active"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),

    contentHash: text("content_hash"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("source_editions_series_year_uq").on(table.sourceSeriesId, table.year)],
);

// ---------------------------------------------------------------------------
// 9.6 domains
// ---------------------------------------------------------------------------
export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

// ---------------------------------------------------------------------------
// 9.8 task_tags
// ---------------------------------------------------------------------------
export const taskTags = pgTable("task_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});

// ---------------------------------------------------------------------------
// 9.4 challenges
// ---------------------------------------------------------------------------
export const challengeStatusValues = [
  "upcoming",
  "open",
  "evaluation",
  "closed",
  "unknown",
] as const;
export type ChallengeStatus = (typeof challengeStatusValues)[number];

export const challenges = pgTable(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),

    name: text("name").notNull(),
    shortName: text("short_name"),
    description: text("description"),

    venueId: uuid("venue_id").references(() => venues.id, { onDelete: "set null" }),
    venueYear: integer("venue_year"),

    sourceEditionId: uuid("source_edition_id").references(() => sourceEditions.id, {
      onDelete: "set null",
    }),

    hostPlatform: text("host_platform"),

    status: text("status").notNull().default("unknown").$type<ChallengeStatus>(),

    officialUrl: text("official_url").notNull(),

    timezone: text("timezone"),
    timezoneOriginal: text("timezone_original"),

    registrationStart: timestamp("registration_start", { withTimezone: true }),
    registrationDeadline: timestamp("registration_deadline", { withTimezone: true }),

    challengeStart: timestamp("challenge_start", { withTimezone: true }),
    challengeEnd: timestamp("challenge_end", { withTimezone: true }),

    submissionDeadline: timestamp("submission_deadline", { withTimezone: true }),

    evaluationStart: timestamp("evaluation_start", { withTimezone: true }),
    evaluationEnd: timestamp("evaluation_end", { withTimezone: true }),

    workshopDate: timestamp("workshop_date", { withTimezone: true }),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull().defaultNow(),

    isActive: boolean("is_active").notNull().default(true),
    isHidden: boolean("is_hidden").notNull().default(false),
    isManuallyCreated: boolean("is_manually_created").notNull().default(false),

    // `search_vector` (tsvector, GIN-indexed) is managed by a raw-SQL
    // migration (Section 27) as a generated column; it is intentionally not
    // modeled here since Drizzle's query builder never needs to write to it.

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("challenges_status_idx").on(table.status),
    index("challenges_venue_idx").on(table.venueId, table.venueYear),
  ],
);

// ---------------------------------------------------------------------------
// 9.5 challenge_links
// ---------------------------------------------------------------------------
export const challengeLinkTypeValues = [
  "official",
  "registration",
  "platform",
  "rules",
  "dataset",
  "leaderboard",
  "github",
  "workshop",
  "conference",
  "other",
] as const;
export type ChallengeLinkType = (typeof challengeLinkTypeValues)[number];

export const challengeLinks = pgTable(
  "challenge_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),

    label: text("label").notNull(),
    url: text("url").notNull(),
    linkType: text("link_type").notNull().$type<ChallengeLinkType>(),

    isPrimary: boolean("is_primary").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("challenge_links_challenge_idx").on(table.challengeId)],
);

// ---------------------------------------------------------------------------
// 9.7 challenge_domains
// ---------------------------------------------------------------------------
export const challengeDomains = pgTable(
  "challenge_domains",
  {
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.challengeId, table.domainId] })],
);

// ---------------------------------------------------------------------------
// 9.9 challenge_task_tags
// ---------------------------------------------------------------------------
export const challengeTaskTags = pgTable(
  "challenge_task_tags",
  {
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    taskTagId: uuid("task_tag_id")
      .notNull()
      .references(() => taskTags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.challengeId, table.taskTagId] })],
);

// ---------------------------------------------------------------------------
// 9.10 challenge_source_records (provenance)
// ---------------------------------------------------------------------------
export const challengeSourceRecords = pgTable(
  "challenge_source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),
    sourceSeriesId: uuid("source_series_id")
      .notNull()
      .references(() => sourceSeries.id, { onDelete: "cascade" }),
    sourceEditionId: uuid("source_edition_id").references(() => sourceEditions.id, {
      onDelete: "set null",
    }),

    sourceUrl: text("source_url").notNull(),
    externalKey: text("external_key"),

    rawTitle: text("raw_title"),
    rawPayloadJson: jsonb("raw_payload_json"),

    contentHash: text("content_hash"),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("challenge_source_records_challenge_idx").on(table.challengeId),
    index("challenge_source_records_series_idx").on(table.sourceSeriesId),
  ],
);

// ---------------------------------------------------------------------------
// 9.11 field_overrides
// ---------------------------------------------------------------------------
export const fieldOverrides = pgTable(
  "field_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id")
      .notNull()
      .references(() => challenges.id, { onDelete: "cascade" }),

    fieldName: text("field_name").notNull(),
    overrideValue: jsonb("override_value").notNull(),

    reason: text("reason"),
    createdBy: text("created_by"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("field_overrides_challenge_field_uq").on(table.challengeId, table.fieldName)],
);

// ---------------------------------------------------------------------------
// 9.12 crawl_runs
// ---------------------------------------------------------------------------
export const crawlRunStatusValues = ["running", "success", "partial_success", "failed"] as const;
export type CrawlRunStatus = (typeof crawlRunStatusValues)[number];

export const crawlRuns = pgTable("crawl_runs", {
  id: uuid("id").primaryKey().defaultRandom(),

  sourceSeriesId: uuid("source_series_id").references(() => sourceSeries.id, {
    onDelete: "set null",
  }),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),

  status: text("status").notNull().default("running").$type<CrawlRunStatus>(),

  editionsDiscovered: integer("editions_discovered").notNull().default(0),
  recordsParsed: integer("records_parsed").notNull().default(0),
  recordsInserted: integer("records_inserted").notNull().default(0),
  recordsUpdated: integer("records_updated").notNull().default(0),
  recordsUnchanged: integer("records_unchanged").notNull().default(0),
  recordsFailed: integer("records_failed").notNull().default(0),

  errorSummary: text("error_summary"),
  logJson: jsonb("log_json"),
});

// ---------------------------------------------------------------------------
// Section 39 — audit_log
// ---------------------------------------------------------------------------
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  fieldName: text("field_name"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Section 52 — slug redirects (challenge & venue slug stability)
// ---------------------------------------------------------------------------
export const slugRedirects = pgTable("slug_redirects", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(), // 'challenge' | 'venue'
  oldSlug: text("old_slug").notNull(),
  newSlug: text("new_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("slug_redirects_type_old_uq").on(table.entityType, table.oldSlug)]);

export const now = sql`now()`;
