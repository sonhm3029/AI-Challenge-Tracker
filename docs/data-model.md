# Data model

Full schema lives in `db/schema.ts` (Drizzle). This is a map of how the
tables relate and why, not a column-by-column restatement — read the schema
file for exact types/constraints.

```text
venues ──┬── source_series ──── source_editions
         │         │                   │
         │         │                   │
         └── challenges ───────────────┘
                │  │  │
                │  │  └── challenge_source_records (provenance, one per source_url)
                │  └───── challenge_links
                └──────── challenge_domains ── domains
                          challenge_task_tags ── task_tags
                          field_overrides (manual corrections)

crawl_runs ── source_series (operational history)
audit_log   (manual-edit trail, entity_type/entity_id are polymorphic)
slug_redirects (Section 52 — stable public URLs)
```

## Why venues and source_series are separate

A **venue** (`CVPR`, `WSDM`, `RecSys`, …) is the conference/community.
A **source_series** is one crawlable thing tied to an adapter (`wsdm-cup`
→ `scrapers/wsdm.ts`). Most venues have exactly one source series, but this
split matters because:

- A venue can have zero source series (not yet automated) or, in principle,
  more than one (e.g. a venue with multiple independent challenge tracks
  crawled by different adapters).
- `source_series` carries crawl-health state (`last_checked_at`,
  `consecutive_failures`, `enabled`, …) that has nothing to do with the
  venue as a concept.

## Why source_editions exist

A `source_series` discovers yearly `source_editions` (Section 5 — "track
series, not single URLs"). This is what makes a conference announcing next
year's edition show up automatically: the adapter's `discoverEditions()`
finds the new URL, `persistEdition()` upserts a new `source_editions` row,
and every challenge scraped from it links back to that edition
(`challenges.source_edition_id`).

## Why challenge_source_records is separate from challenges

A single logical challenge can be *seen* from more than one source page
(the venue site, a workshop site, a hosting platform). `challenge_source_records`
is the append-only provenance trail — one row per `(challenge, source_url)`
pair, holding the raw scraped payload, a content hash (Section 49, to avoid
rewriting unchanged data), and first/last-seen timestamps. `challenges`
itself holds only the current resolved values. Deleting a challenge's
source record because a page moved would destroy the audit trail
unnecessarily, so it's never done automatically — see
`docs/crawler-operations.md`'s deletion policy.

## Why field_overrides is a separate table, not just "locked" columns on challenges

Section 9.11's resolution priority is **manual override > latest scraped
value > existing stored value**. Storing overrides as their own rows
(rather than e.g. a bitmask of locked columns) means:

- An admin can override exactly one field (say, `submission_deadline`)
  without freezing the rest of the record against future crawls.
- The override's `reason`/`created_by`/timestamps are themselves an audit
  trail, independent of `audit_log`.
- `lib/overrides.ts` can filter a crawler's proposed update in one query
  (`stripOverriddenFields`) without touching schema.

## Status is stored, not purely computed

`challenges.status` is a persisted column, computed by
`lib/challengeStatus.ts` from the structured date columns. It's
recomputed on every crawl touch — including when a source's scraped
content hasn't changed, since status is time-derived and the clock moving
forward can flip `open` → `evaluation` → `closed` with zero new data (see
the "unchanged" branch in `jobs/updateSource.ts`). An admin's manual status
override still wins over the computed value.

## Search

`challenges.search_vector` (Section 27) is a **generated, stored `tsvector`
column** added by the raw-SQL migration `db/migrations/0001_search_vector.sql`
— it isn't modeled in `db/schema.ts` because Drizzle's query builder never
writes to it directly; queries reference it via a raw `sql` fragment in
`lib/queries.ts`. Venue-name and task-tag search happen via joins/`EXISTS`
in the same query rather than a maintained cross-table tsvector, since
those are small lookup tables at this scale (Section 58).

## Slugs

`challenges.slug` and `venues.slug` are the public URL. Once created, a
slug is never silently changed by a re-crawl — `buildChallengeSlug` (used
only at insert time) and `ensureUniqueSlug` are the only places a slug is
computed. `slug_redirects` exists for the rare case an admin needs to
change one on purpose (Section 52) — merge/rename flows should insert a
redirect row rather than orphaning the old URL.
