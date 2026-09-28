# Academic AI Challenge Tracker
## Production Product Specification & Engineering Design

**Document type:** Product + System Design Specification  
**Intended implementation agent:** Codex / software engineering team  
**Status:** Implementation-ready  
**Primary goal:** Build a reliable production website for tracking academic AI/ML challenges, competitions, cups, benchmarks, and shared tasks associated with established research conferences and research communities.

---

# 1. Executive Summary

Build a production-grade web application that continuously tracks academic AI/ML challenges from known official sources and presents them in a clean, deadline-oriented interface.

The user experience should be analogous to an **AI conference deadline tracker**, but focused on challenges rather than paper submission deadlines.

The application must answer these questions quickly and reliably:

- What AI/ML research challenges are currently open?
- What challenges will open soon?
- Which conference or research venue is each challenge associated with?
- What is the next important deadline?
- How much time remains until that deadline?
- What are the challenge's official links?
- When was this information last verified?

The product is intentionally narrow.

It is **not**:
- an AI research recommendation engine;
- a publication-strategy assistant;
- a challenge ranking system;
- a leaderboard mirror;
- a generic competition aggregator.

Its value comes from **coverage, correctness, freshness, and low-friction navigation**.

---

# 2. Product Philosophy

The product should optimize for:

1. **Correctness**
   - Dates and links must be traceable to official sources.
   - The system must preserve provenance.

2. **Freshness**
   - Known sources are refreshed automatically every day.
   - New yearly editions of known venues should be discovered automatically.

3. **Reliability**
   - A broken source must not break the global update job.
   - Temporary upstream failures must not erase existing data.

4. **Maintainability**
   - Each conference or ecosystem should have an isolated adapter.
   - Adding a new venue must not require modifying unrelated code.

5. **Simplicity**
   - No unnecessary LLM agent architecture.
   - No vector database.
   - No microservices unless later justified by scale.

6. **Human correction**
   - Crawlers will occasionally be wrong.
   - Admin overrides are a first-class requirement.

---

# 3. Scope

## 3.1 Core Production Scope

The production system must support:

- public challenge listing;
- open / upcoming / evaluation / closed status;
- live countdown to the next relevant milestone;
- conference / venue association;
- venue year;
- domain tags;
- challenge detail page;
- multiple official links;
- timeline of important dates;
- full-text search;
- filters;
- sorting;
- venue pages;
- automatic daily refresh;
- automatic detection of new yearly editions of known sources;
- data provenance;
- last-verified timestamps;
- manual correction workflow;
- stale-source detection;
- structured logs;
- crawler health status;
- retries;
- idempotent updates;
- admin disable/archive controls;
- production deployment;
- CI/CD;
- automated tests;
- observability;
- rate limiting for crawlers;
- backup and restore strategy.

## 3.2 Explicitly Out of Scope

Do not implement these unless separately requested later:

- research-potential scores;
- paper-potential scores;
- LLM-generated recommendations;
- automatic method suggestions;
- paper summarization;
- team assignment;
- student progress tracking;
- leaderboard ingestion;
- prize tracking;
- arbitrary web-wide challenge discovery;
- social features;
- comments;
- public user accounts;
- personalized recommendations;
- Slack/Discord integrations;
- Kafka;
- RabbitMQ;
- distributed crawling infrastructure.

The system may later add alerts or watchlists, but these are not required in the first production release.

---

# 4. Core Domain Model

The system tracks **Challenge Series / Venue Sources** and **Challenge Editions**.

A single challenge can be associated with:

- a conference;
- a workshop;
- a challenge series;
- a hosting platform;
- several official URLs;
- several deadlines.

Examples:

- WSDM Cup 2027
- RecSys Challenge 2027
- NeurIPS 2027 Competition X
- CVPR 2027 Workshop Challenge Y
- SemEval 2027 Task Z
- MICCAI 2027 Grand Challenge A
- ICASSP 2027 Signal Processing Grand Challenge B

---

# 5. Important Product Decision: Track Series, Not Single URLs

The system must not be designed around static yearly URLs such as:

```text
https://example.org/2027/challenges
```

Instead, model a **source series**:

```text
CVPR
WSDM Cup
RecSys Challenge
NeurIPS Competitions
SemEval
ICASSP SP Grand Challenges
MICCAI Grand Challenges
```

Each source adapter must know how to discover available yearly editions.

Example:

```text
CVPR
 ├── 2026
 ├── 2027
 └── 2028   <-- automatically detected when it appears
```

This is a core requirement.

---

# 6. High-Level Architecture

```text
                    ┌────────────────────┐
                    │ Known Source Registry
                    │ venues / challenge series
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Source Adapters    │
                    │ one per ecosystem │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Daily Scheduler    │
                    │ cron / workflow    │
                    └──────────┬─────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │ Fetch → Parse → Normalize      │
              │ Validate → Diff → Upsert       │
              └───────────────┬────────────────┘
                              │
                              ▼
                   ┌────────────────────┐
                   │ PostgreSQL         │
                   │ source provenance  │
                   │ overrides          │
                   └──────────┬─────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
           ┌────────────────┐   ┌────────────────┐
           │ Public Website │   │ Admin Console  │
           └────────────────┘   └────────────────┘
```

---

# 7. Recommended Production Stack

Use a single TypeScript monorepo unless implementation constraints require otherwise.

## Application

- **Next.js**
- **TypeScript**
- **Tailwind CSS**
- React Server Components where appropriate

## Database

- **PostgreSQL**
- Supabase-hosted PostgreSQL is acceptable
- ORM: **Drizzle** preferred for explicit SQL-like schema control
- Prisma acceptable if preferred by implementation team

## Scraping

- native `fetch` / `undici`
- `cheerio`
- Playwright as fallback only
- `robots-parser` if useful
- date parsing utilities

## Scheduling

Preferred:
- **GitHub Actions scheduled workflow** for crawler jobs

Alternative:
- Vercel Cron

Reason for preferring GitHub Actions:
- persistent job logs;
- manual reruns;
- independent from frontend deployment runtime;
- easier debugging.

## Deployment

Recommended:
- Vercel for Next.js
- Supabase / managed Postgres for database
- GitHub Actions for crawler jobs

## Monitoring

Recommended:
- Sentry for application errors
- structured crawler logs
- optional Better Uptime / equivalent for availability monitoring

---

# 8. Repository Structure

```text
academic-ai-challenge-tracker/
│
├── app/
│   ├── page.tsx
│   ├── challenges/
│   │   └── [slug]/
│   │       └── page.tsx
│   ├── venues/
│   │   └── [slug]/
│   │       └── page.tsx
│   ├── calendar/
│   │   └── page.tsx
│   ├── admin/
│   │   ├── challenges/
│   │   ├── sources/
│   │   └── crawl-runs/
│   └── api/
│
├── components/
│   ├── ChallengeCard.tsx
│   ├── ChallengeFilters.tsx
│   ├── Countdown.tsx
│   ├── Timeline.tsx
│   ├── DeadlineBadge.tsx
│   ├── DomainBadge.tsx
│   └── SourceFreshness.tsx
│
├── lib/
│   ├── db/
│   ├── dates/
│   ├── slug.ts
│   ├── challengeStatus.ts
│   ├── challengeDeadline.ts
│   ├── normalize.ts
│   ├── dedupe.ts
│   ├── logger.ts
│   └── scraping/
│       ├── fetchHtml.ts
│       ├── fetchRenderedHtml.ts
│       ├── parseDates.ts
│       ├── extractLinks.ts
│       ├── normalizeUrl.ts
│       └── rateLimiter.ts
│
├── scrapers/
│   ├── types.ts
│   ├── registry.ts
│   ├── cvpr.ts
│   ├── neurips.ts
│   ├── kdd.ts
│   ├── wsdm.ts
│   ├── recsys.ts
│   ├── semeval.ts
│   ├── icassp.ts
│   ├── miccai.ts
│   ├── clef.ts
│   └── ...
│
├── jobs/
│   ├── updateAllSources.ts
│   ├── updateSource.ts
│   ├── reconcileStaleRecords.ts
│   └── healthReport.ts
│
├── db/
│   ├── schema.ts
│   ├── migrations/
│   └── seed.ts
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── adapters/
│   └── fixtures/
│
├── scripts/
│   ├── scrape-source.ts
│   ├── validate-source.ts
│   └── import-manual.ts
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy.yml
│       └── daily-crawl.yml
│
├── docs/
│   ├── adding-a-source.md
│   ├── crawler-operations.md
│   └── data-model.md
│
├── README.md
└── package.json
```

---

# 9. Database Design

## 9.1 venues

```sql
venues
------
id uuid primary key
name text not null
slug text unique not null
homepage_url text
short_name text
is_active boolean default true
created_at timestamptz
updated_at timestamptz
```

Examples:

```text
CVPR
ICCV
ECCV
NeurIPS
KDD
WSDM
RecSys
SIGIR
MICCAI
ICASSP
SemEval
```

---

# 9.2 source_series

Represents a stable source family.

```sql
source_series
-------------
id uuid primary key
name text not null
slug text unique not null

venue_id uuid nullable

adapter_name text not null
root_url text not null

enabled boolean default true

discovery_strategy text
config_json jsonb

crawl_interval_hours integer default 24

last_checked_at timestamptz
last_success_at timestamptz
last_failure_at timestamptz
consecutive_failures integer default 0
last_error text

created_at timestamptz
updated_at timestamptz
```

Examples:

```text
NeurIPS Competitions
WSDM Cup
RecSys Challenge
SemEval
ICASSP SP Grand Challenges
MICCAI Grand Challenges
```

---

# 9.3 source_editions

Represents annual editions discovered by a source.

```sql
source_editions
---------------
id uuid primary key
source_series_id uuid not null
year integer not null
url text not null

status text
first_seen_at timestamptz
last_seen_at timestamptz
last_checked_at timestamptz

content_hash text

created_at timestamptz
updated_at timestamptz

unique(source_series_id, year)
```

---

# 9.4 challenges

```sql
challenges
----------
id uuid primary key
slug text unique not null

name text not null
short_name text
description text

venue_id uuid nullable
venue_year integer nullable

source_edition_id uuid nullable

host_platform text nullable

status text not null

official_url text not null

timezone text nullable
timezone_original text nullable

registration_start timestamptz nullable
registration_deadline timestamptz nullable

challenge_start timestamptz nullable
challenge_end timestamptz nullable

submission_deadline timestamptz nullable

evaluation_start timestamptz nullable
evaluation_end timestamptz nullable

workshop_date timestamptz nullable

first_seen_at timestamptz not null
last_seen_at timestamptz not null
last_verified_at timestamptz not null

is_active boolean default true
is_hidden boolean default false
is_manually_created boolean default false

created_at timestamptz
updated_at timestamptz
```

---

# 9.5 challenge_links

```sql
challenge_links
---------------
id uuid primary key
challenge_id uuid not null

label text not null
url text not null
link_type text not null

is_primary boolean default false

created_at timestamptz
updated_at timestamptz
```

Valid `link_type` values:

```text
official
registration
platform
rules
dataset
leaderboard
github
workshop
conference
other
```

---

# 9.6 domains

```sql
domains
-------
id uuid primary key
name text unique not null
slug text unique not null
```

Recommended seed values:

```text
Computer Vision
NLP
LLM
Agents
Information Retrieval
Recommender Systems
Data Mining
Audio
Speech
Multimodal
Medical AI
Robotics
Scientific ML
Optimization
General ML
```

---

# 9.7 challenge_domains

```sql
challenge_domains
-----------------
challenge_id uuid
domain_id uuid
primary key(challenge_id, domain_id)
```

---

# 9.8 task_tags

Optional taxonomy:

```sql
task_tags
---------
id uuid
name text unique
slug text unique
```

Examples:

```text
super-resolution
segmentation
retrieval
recommendation
reasoning
tool-use
generation
classification
deepfake-detection
speech-recognition
medical-imaging
robot-navigation
```

---

# 9.9 challenge_task_tags

```sql
challenge_task_tags
-------------------
challenge_id uuid
task_tag_id uuid
primary key(challenge_id, task_tag_id)
```

---

# 9.10 challenge_source_records

Critical provenance table.

```sql
challenge_source_records
------------------------
id uuid primary key

challenge_id uuid not null
source_series_id uuid not null
source_edition_id uuid nullable

source_url text not null
external_key text nullable

raw_title text
raw_payload_json jsonb

content_hash text

first_seen_at timestamptz
last_seen_at timestamptz

created_at timestamptz
updated_at timestamptz
```

---

# 9.11 field_overrides

Manual corrections must be durable.

```sql
field_overrides
---------------
id uuid primary key
challenge_id uuid not null

field_name text not null
override_value jsonb not null

reason text
created_by text

created_at timestamptz
updated_at timestamptz

unique(challenge_id, field_name)
```

Resolution priority:

```text
manual override
>
latest valid scraped value
>
existing stored value
```

Crawler updates must never silently overwrite a manual override.

---

# 9.12 crawl_runs

Operational visibility.

```sql
crawl_runs
----------
id uuid primary key

source_series_id uuid nullable

started_at timestamptz
finished_at timestamptz

status text

editions_discovered integer default 0
records_parsed integer default 0
records_inserted integer default 0
records_updated integer default 0
records_unchanged integer default 0
records_failed integer default 0

error_summary text
log_json jsonb
```

Status:

```text
running
success
partial_success
failed
```

---

# 10. Source Adapter Interface

Every source adapter must implement the same contract.

```ts
export interface ChallengeSourceAdapter {
  sourceId: string;
  venueSlug?: string;

  discoverEditions(
    context: CrawlContext
  ): Promise<SourceEditionCandidate[]>;

  fetchChallenges(
    edition: SourceEditionCandidate,
    context: CrawlContext
  ): Promise<ScrapedChallenge[]>;
}
```

Types:

```ts
export interface SourceEditionCandidate {
  year: number;
  url: string;
  metadata?: Record<string, unknown>;
}

export interface ScrapedChallenge {
  externalKey?: string;

  name: string;
  shortName?: string;
  description?: string;

  venueSlug?: string;
  venueYear?: number;

  officialUrl: string;

  links?: {
    label: string;
    type: ChallengeLinkType;
    url: string;
  }[];

  hostPlatform?: string;

  registrationStart?: ParsedDate;
  registrationDeadline?: ParsedDate;

  challengeStart?: ParsedDate;
  challengeEnd?: ParsedDate;

  submissionDeadline?: ParsedDate;

  evaluationStart?: ParsedDate;
  evaluationEnd?: ParsedDate;

  workshopDate?: ParsedDate;

  domains?: string[];
  taskTags?: string[];

  sourceUrl: string;

  rawPayload?: unknown;
}
```

---

# 11. Edition Discovery Strategies

Each adapter may implement one of these strategies.

## 11.1 Predictable URLs

Probe:

```text
current year - 1
current year
current year + 1
current year + 2
```

Only save editions returning valid conference content.

---

## 11.2 Stable archive page

Parse an archive page:

```text
2026
2027
2028
```

and discover annual URLs.

---

## 11.3 Stable series homepage

Example:

```text
https://recsyschallenge.com/
```

Parse latest and historical edition links.

---

## 11.4 Conference navigation discovery

Search within the official site for links containing:

```text
challenge
competition
cup
shared task
grand challenge
benchmark
contest
```

This is still source-local discovery, not web-wide discovery.

---

## 11.5 Manual mapping

When websites are inconsistent:

```ts
{
  editions: {
    2027: "https://...",
    2028: "https://..."
  }
}
```

Manual mapping is valid and preferable to fragile automation.

---

# 12. Fetching Requirements

## 12.1 Default

Use HTTP fetch with:

- timeout;
- retries;
- clear user-agent;
- redirect handling;
- gzip/br support;
- rate limiting.

Suggested user-agent:

```text
AcademicChallengeTracker/1.0 (+project-contact-url)
```

---

# 12.2 Retries

Retry only transient failures:

```text
408
429
500
502
503
504
network timeout
connection reset
```

Use exponential backoff with jitter.

Suggested:

```text
attempt 1
wait ~2s
attempt 2
wait ~5s
attempt 3
```

Do not aggressively retry 4xx errors.

---

# 12.3 Rate Limiting

Per-domain limiter.

Default:

```text
1 request / second / domain
```

Allow adapter overrides.

Do not hammer conference websites.

---

# 12.4 Playwright Fallback

Use Playwright only when:

- HTML fetch clearly lacks rendered challenge content;
- page requires JavaScript;
- adapter explicitly opts in.

Do not globally use a browser for all pages.

---

# 13. Parsing and Normalization

Normalize:

- whitespace;
- Unicode;
- URLs;
- titles;
- venue names;
- year values;
- timezones;
- date formats.

Store both:

```text
normalized value
original raw value
```

when ambiguity matters.

Example:

```text
timezone = "Etc/GMT+12"
timezone_original = "AoE"
```

---

# 14. Date Handling

Date correctness is critical.

Support:

- ISO dates;
- month-name formats;
- `DD Month YYYY`;
- `Month DD, YYYY`;
- UTC;
- AoE;
- local conference time;
- date-only values.

When source provides only a date:

```text
May 14, 2027
```

do not invent 23:59 unless explicitly stated.

Represent precision if needed.

Recommended helper type:

```ts
type ParsedDate = {
  value: Date | null;
  originalText: string;
  timezone?: string;
  precision: "date" | "minute" | "second";
};
```

---

# 15. Challenge Status

Derived states:

```text
upcoming
open
evaluation
closed
unknown
```

Suggested logic:

## Upcoming

No participant activity window has opened yet.

## Open

At least one of:

- registration open;
- submissions open;
- challenge participation active.

## Evaluation

Submission/participation closed but official evaluation is still active.

## Closed

All known relevant dates are past.

## Unknown

Insufficient structured dates.

A manual status override must be possible.

---

# 16. Next Relevant Milestone

Homepage cards should show one primary countdown.

Implement:

```ts
getNextRelevantMilestone(challenge, now)
```

Possible milestones:

1. registration deadline
2. submission deadline
3. challenge end
4. evaluation end
5. workshop date

Choose the earliest future participant-relevant milestone.

Return:

```ts
{
  type,
  label,
  timestamp
}
```

Countdown is rendered client-side.

---

# 17. Deduplication

A challenge can appear in multiple places:

```text
conference site
workshop site
challenge homepage
Codabench
Kaggle
EvalAI
Grand-Challenge.org
GitHub
```

Do not create duplicates.

Use deterministic candidate matching.

Suggested features:

```text
normalized name
venue
venue year
official domain
external key
challenge series
```

Do not auto-merge low-confidence cases.

Preferred behavior:

```text
uncertain -> preserve separately -> admin review
```

False merge is worse than duplicate display.

---

# 18. Upsert Semantics

Crawler writes must be idempotent.

Given the same source data twice:

```text
database state must remain unchanged
```

Rules:

- stable challenge identity;
- update changed scraped fields;
- preserve manual overrides;
- preserve historical provenance;
- refresh `last_seen_at`;
- refresh `last_verified_at` only after successful verification.

Never blindly replace full rows.

---

# 19. Deletion Policy

Never automatically delete a challenge because it disappears upstream.

Reasons:

- source temporarily unavailable;
- website redesign;
- page moved;
- challenge archived;
- crawler bug.

Use lifecycle fields:

```text
last_seen_at
is_active
is_hidden
```

Potential stale policy:

```text
not seen for 30 days -> flag stale
not seen for 90 days -> admin review
```

Do not hard-delete automatically.

---

# 20. Daily Update Workflow

Run daily.

Recommended:

```text
03:00 UTC
```

Pseudo-code:

```ts
async function updateAllSources() {
  const sources = await getEnabledSources();

  for (const source of sources) {
    await runSourceSafely(source);
  }
}
```

Per-source:

```ts
async function runSourceSafely(source) {
  const run = await createCrawlRun(source);

  try {
    const adapter = getAdapter(source.adapterName);

    const editions = await adapter.discoverEditions(context);

    for (const edition of editions) {
      await persistEdition(edition);

      const records = await adapter.fetchChallenges(
        edition,
        context
      );

      for (const record of records) {
        const validated = validate(record);
        const normalized = normalize(validated);

        const candidate = await findExistingChallenge(normalized);

        await upsertChallenge({
          candidate,
          normalized,
          source
        });
      }
    }

    await completeRunSuccess(run);
  } catch (error) {
    await completeRunFailure(run, error);
  }
}
```

One source failing must not interrupt others.

---

# 21. Source Health

Admin must be able to see source health.

Fields:

```text
last checked
last success
last failure
consecutive failures
latest error
number of records
```

Status badges:

```text
Healthy
Warning
Failing
Disabled
```

Suggested:

```text
Healthy: latest run success
Warning: 1-2 consecutive failures
Failing: >=3 consecutive failures
```

---

# 22. Admin Interface

Production version should include an internal admin interface.

Authentication can be simple:

- Supabase Auth;
- GitHub OAuth allowlist;
- or password-protected internal account.

Required admin functions:

## Challenge management

- inspect challenge;
- edit title;
- edit description;
- edit dates;
- edit timezone;
- edit URLs;
- edit tags;
- hide/unhide challenge;
- archive challenge;
- create challenge manually;
- merge duplicates;
- view provenance;
- view raw scraper payload.

## Source management

- enable/disable source;
- manually trigger crawl;
- inspect last runs;
- inspect adapter errors;
- inspect editions discovered.

## Override management

Every manual edit to a scraped field should create/update a `field_override`.

---

# 23. Public Homepage

Route:

```text
/
```

Layout:

```text
Academic AI Challenges

Search...

[Status] [Domain] [Venue] [Year]

---------------------------------
OPEN NOW
---------------------------------

Challenge Card
Challenge Card

---------------------------------
UPCOMING
---------------------------------

Challenge Card
Challenge Card

---------------------------------
RECENTLY CLOSED
---------------------------------

Challenge Card
```

---

# 24. Challenge Card

Show:

```text
Challenge Name

Venue Year
Domain · Domain

Status

Next milestone label
XXd XXh XXm

Absolute date

[Official website]
```

Example:

```text
WSDM Cup 2027

WSDM 2027
Information Retrieval · Recommender Systems

Open

Submission deadline
18d 04h 32m

Feb 5, 2027

Official website →
```

Keep cards compact.

---

# 25. Challenge Detail Page

Route:

```text
/challenges/[slug]
```

Show:

```text
Challenge Name

Venue + Year
Domains
Status

Next deadline
Countdown
Absolute date
Timezone

Timeline

Official links

Description

Source provenance
Last verified
```

Example timeline:

```text
Nov 16, 2026
Competition starts

Jan 20, 2027
Registration deadline

Feb 5, 2027
Submission deadline

Mar 12, 2027
Workshop
```

---

# 26. Venue Page

Route:

```text
/venues/[slug]
```

Example:

```text
/venues/cvpr
```

Show editions grouped by year:

```text
CVPR

2028
- Challenge A
- Challenge B

2027
- Challenge C
- Challenge D

2026
- Challenge E
```

---

# 27. Search

Search:

- challenge name;
- venue name;
- task tags;
- domain tags.

PostgreSQL full-text search is sufficient.

Do not add Elasticsearch.

---

# 28. Filters

Required:

## Status

```text
Open
Upcoming
Evaluation
Closed
```

## Domain

```text
CV
NLP
LLM
Agents
IR
RecSys
Audio
Speech
Medical AI
Robotics
Multimodal
Scientific ML
Optimization
General ML
```

## Venue

All tracked venues.

## Year

Current and future years, plus historical years.

---

# 29. Sorting

Default:

## Open

Nearest upcoming milestone first.

## Upcoming

Earliest start / registration opening first.

## Closed

Most recently closed first.

Optional user sort:

```text
deadline
recently added
venue
```

---

# 30. Countdown

Countdown is calculated client-side.

Stored server value:

```text
deadline timestamp
```

UI:

```text
18d 04h 32m
```

When deadline passes:

- recalculate next relevant milestone;
- do not continue negative countdown.

If no future milestone:

```text
Closed
```

---

# 31. Calendar Page

Route:

```text
/calendar
```

Production implementation can initially be a chronological agenda, not a complex month-grid.

Example:

```text
October 2027

Oct 3
Challenge A registration deadline

Oct 14
Challenge B submission deadline

Oct 29
Challenge C evaluation closes
```

---

# 32. Source Provenance

Every challenge detail page must show:

```text
Last verified: YYYY-MM-DD

Official sources:
- URL 1
- URL 2
```

Admin page additionally shows:

- raw source record;
- source adapter;
- crawl run;
- source edition;
- content hash.

---

# 33. Initial Source Registry

Seed the system with these ecosystems.

## General AI / ML

```text
NeurIPS
ICML
ICLR
AAAI
IJCAI
```

## Computer Vision

```text
CVPR
ICCV
ECCV
WACV
```

## Data Mining / Search / Recommendation / Web

```text
KDD
WSDM
RecSys
SIGIR
CIKM
The Web Conference
ECML-PKDD
PAKDD
TREC
CLEF
```

## Multimedia

```text
ACM Multimedia
```

## NLP

```text
ACL
EMNLP
NAACL
SemEval
WMT
```

## Speech / Audio

```text
ICASSP
INTERSPEECH
DCASE
```

## Medical AI

```text
MICCAI
MIDL
ISBI
Grand-Challenge.org
```

## Robotics

```text
ICRA
IROS
RoboCup
```

## Optimization

```text
IEEE CEC
```

---

# 34. Source Implementation Priority

This is a production roadmap, not an MVP cut.

Implement all priority groups, but in this order.

## Priority A

```text
NeurIPS Competitions
WSDM Cup
KDD Cup
RecSys Challenge
SemEval
ICASSP SP Grand Challenges
MICCAI / Grand-Challenge.org
CVPR
```

## Priority B

```text
ICCV
ECCV
WACV
SIGIR
CIKM
CLEF
TREC
MIDL
ISBI
INTERSPEECH
DCASE
ICRA
IROS
```

## Priority C

```text
ICML workshop challenges
ICLR workshop challenges
AAAI competitions
IJCAI competitions
ACL shared tasks
EMNLP shared tasks
NAACL shared tasks
ACM Multimedia Grand Challenges
ECML-PKDD Discovery Challenge
PAKDD
RoboCup
IEEE CEC
```

The implementation should not stop after Priority A if the requested goal is the complete production tracker.

---

# 35. Official-Source Priority

Prefer:

```text
1. Official challenge website
2. Official conference website
3. Official hosting platform
4. Organizer-controlled GitHub
5. Trusted aggregator only as fallback
```

Do not treat aggregators as authoritative when official pages exist.

---

# 36. LLM Policy

The production system should not require an LLM for normal operation.

LLM may later be introduced as a fallback for highly irregular content.

If implemented:

```text
normal parser
    ↓ fails
LLM structured extraction
    ↓
schema validation
    ↓
confidence threshold
    ↓
admin review if uncertain
```

Never allow unvalidated LLM output to write directly to production fields.

LLM use cases may include:

- unusual natural-language dates;
- irregular page structure;
- identifying challenge sections in long workshop pages.

LLM must not be used for:
- countdown;
- date comparison;
- status calculation;
- filtering;
- dedupe exact matches;
- database queries.

---

# 37. Caching

Public read traffic should not hit the database excessively.

Use:

- Next.js caching / ISR;
- database query caching where useful.

Recommended refresh:

```text
homepage: 5-15 minutes
challenge pages: 15-60 minutes
venue pages: 15-60 minutes
```

Crawler writes can trigger revalidation if implemented.

---

# 38. Security

## Public application

- read-only public data;
- sanitize rendered HTML;
- do not expose crawler secrets.

## Admin

- authentication required;
- role-based access minimal but explicit;
- CSRF-safe mutations;
- audit manual changes.

## Cron endpoint

If using HTTP cron:

```text
Authorization: Bearer CRON_SECRET
```

Never expose unrestricted crawl trigger endpoints publicly.

---

# 39. Auditability

Manual changes should be traceable.

Recommended audit log:

```sql
audit_log
---------
id
entity_type
entity_id
action
field_name
old_value
new_value
actor
created_at
```

At minimum track:

- manual challenge edits;
- source enable/disable;
- manual merge;
- manual archive.

---

# 40. Observability

Production must expose enough information to diagnose failures.

## Required

- structured application logs;
- structured crawl logs;
- per-source crawl history;
- latest errors;
- error monitoring.

## Recommended alerts

Send internal alert when:

```text
source fails >= 3 consecutive runs
daily crawl fails globally
database unavailable
public site returns repeated 5xx
```

Alert destination can initially be email or GitHub issue.

---

# 41. Backups

Use managed Postgres backups.

Minimum:

- daily automated backups;
- retention >= 7 days;
- point-in-time recovery if available.

Before major migrations:

- create snapshot / backup.

---

# 42. Schema Migrations

All database changes must use migrations committed to git.

Never make undocumented production-only schema changes.

---

# 43. CI

Every pull request must run:

```text
TypeScript typecheck
ESLint
unit tests
adapter fixture tests
build
```

Optional:

```text
Playwright UI smoke tests
```

---

# 44. Adapter Tests

Every adapter should have local fixtures.

Example:

```text
tests/fixtures/wsdm/2027.html
tests/fixtures/recsys/2027.html
```

Tests must not rely only on live websites.

Required assertions:

- edition discovery;
- challenge count;
- title extraction;
- URL extraction;
- date extraction.

When upstream HTML changes, fixture tests make parser regressions visible.

---

# 45. Integration Tests

Test:

- scrape fixture;
- normalize;
- dedupe;
- upsert;
- retrieve public challenge.

Use test database.

---

# 46. Date Tests

Cover:

- AoE;
- UTC;
- local timezone;
- date-only values;
- malformed dates;
- missing timezone;
- daylight-saving transitions where applicable.

---

# 47. Status Tests

Test transitions:

```text
upcoming -> open
open -> evaluation
evaluation -> closed
```

Also:

- missing dates;
- registration only;
- submission deadline only.

---

# 48. Data Quality Checks

After every crawl:

- count parsed records;
- compare with previous run;
- detect suspicious changes.

Examples:

```text
previous run: 30 challenges
current run: 0
```

Do not immediately accept this as valid.

Flag as anomaly.

Suggested checks:

```text
record count drop >80%
all dates disappeared
official URLs all changed domain
parser returns zero records
```

Mark crawl as `partial_success` or `suspect`.

Do not overwrite good data with obviously broken parse output.

---

# 49. Content Hashing

Store normalized content hash for source records.

If unchanged:

- refresh `last_seen_at`;
- avoid unnecessary field writes.

This reduces churn and improves audit clarity.

---

# 50. Manual Challenge Creation

Admin must be able to create records for:

- irregular sources;
- newly announced challenges;
- temporarily unsupported conferences.

Manual record must support same fields as scraped records.

Set:

```text
is_manually_created = true
```

Crawler may later attach provenance but must not overwrite manual overrides.

---

# 51. Duplicate Merge

Admin merge workflow:

```text
select duplicate A
select duplicate B
choose canonical record
merge links
merge provenance
merge tags
preserve overrides
redirect old slug
```

Maintain redirect table or alias if public URLs may already exist.

---

# 52. Slugs and URL Stability

Challenge URLs must remain stable.

Example:

```text
/challenges/wsdm-cup-2027
```

If title changes:

- do not automatically change slug;
- preserve SEO/public link stability.

If slug manually changed, create redirect.

---

# 53. SEO

Each challenge page:

```text
title:
WSDM Cup 2027 — Deadline, Dates & Official Links

description:
Track deadlines and official links for WSDM Cup 2027.
```

Use:

- canonical URL;
- OpenGraph;
- structured metadata where sensible;
- sitemap.

---

# 54. Accessibility

Target WCAG AA basics:

- semantic HTML;
- keyboard navigation;
- visible focus states;
- adequate contrast;
- countdown not color-only;
- screen-reader labels.

---

# 55. Responsive UI

Must work well on:

```text
mobile
tablet
desktop
```

Cards should not require horizontal scrolling.

---

# 56. Visual Design

Desired character:

```text
clean
academic
compact
information-first
```

Avoid:

- oversized hero areas;
- decorative gradients;
- chart-heavy dashboards;
- excessive animations;
- crowded card metadata.

The deadline/countdown should be visually prominent.

---

# 57. Performance Targets

Reasonable production targets:

- homepage LCP < 2.5s under normal conditions;
- cached public pages fast globally;
- no client-side fetch waterfall for basic challenge listings;
- search/filter response effectively instantaneous for normal dataset size.

Expected dataset size is small enough that PostgreSQL is sufficient.

---

# 58. Expected Scale

Likely order of magnitude:

```text
venues: <100
source series: <200
challenge editions: <10,000
challenge links: <50,000
daily crawl requests: hundreds to low thousands
```

This does not justify distributed architecture.

---

# 59. Operational Commands

Provide scripts:

```bash
npm run crawl:all
npm run crawl:source -- wsdm
npm run crawl:source -- recsys
npm run crawl:dry-run -- cvpr
npm run validate:sources
npm run test
npm run db:migrate
npm run db:seed
```

`crawl:dry-run` must parse and print diffs without mutating production data.

---

# 60. Dry-Run Mode

Required for production operations.

Output example:

```text
Source: WSDM
Edition: 2027

1 new challenge
2 updated
7 unchanged

UPDATE
WSDM Cup 2027
submission_deadline:
old: null
new: 2027-02-05
```

This is essential when adding or repairing adapters.

---

# 61. Environment Configuration

Example:

```text
DATABASE_URL=

NEXT_PUBLIC_SITE_URL=

ADMIN_AUTH_SECRET=

CRON_SECRET=

SENTRY_DSN=

PLAYWRIGHT_ENABLED=true

LLM_FALLBACK_ENABLED=false
LLM_API_KEY=
```

Use separate environments:

```text
development
preview
production
```

Never reuse production database for tests.

---

# 62. Deployment Strategy

Recommended:

## Frontend

Vercel production deployment from main branch.

## Database

Supabase managed PostgreSQL.

## Scheduled crawler

GitHub Actions.

## CI/CD

```text
PR
 -> tests
 -> preview deployment

merge main
 -> migrations
 -> production deployment
```

Database migration ordering must be safe.

---

# 63. Failure Modes

The system must explicitly handle:

## Website moved

Adapter returns 404.

Action:
- log;
- keep old data;
- mark source warning.

## HTML structure changed

Parser returns zero records.

Action:
- anomaly detection;
- do not erase data;
- flag source.

## Deadline changed

Update field and retain provenance.

## Challenge page disappears

Keep challenge.

## Duplicate newly discovered

Run dedupe candidate detection.

## Conference announces new year

Edition discovery inserts new edition automatically.

---

# 64. Adding a New Source

Document this workflow.

## Step 1

Create adapter:

```text
scrapers/example.ts
```

## Step 2

Implement interface.

## Step 3

Add fixtures.

## Step 4

Add tests.

## Step 5

Register adapter.

## Step 6

Add `source_series` config.

## Step 7

Run:

```bash
npm run crawl:dry-run -- example
```

## Step 8

Review output.

## Step 9

Enable production crawling.

Adding a normal source should not require changes to core application code.

---

# 65. Data Import from Existing Trackers

Optional operational utility.

Allow one-time seed imports from:

- CSV;
- JSON.

Imported data must be marked:

```text
source = manual import
```

It must not replace official-source verification.

---

# 66. Production Release Criteria

The system should not be considered production-ready until:

## Data

- priority source adapters are operational;
- provenance is visible;
- dates have timezone handling;
- manual override works;
- duplicates can be corrected.

## Crawler

- scheduled runs work;
- retries work;
- per-source isolation works;
- anomaly detection works;
- crawl history exists;
- dry-run mode exists.

## Website

- homepage;
- search;
- filters;
- detail pages;
- countdown;
- venue pages;
- responsive layout;
- source freshness.

## Admin

- challenge edit;
- manual create;
- hide/archive;
- source health;
- manual crawl;
- duplicate merge or at least safe manual resolution.

## Engineering

- CI;
- migrations;
- backups;
- monitoring;
- structured logs;
- error reporting;
- fixture-based adapter tests.

---

# 67. Initial Production Content Goal

Before public/team launch, populate and validate all currently active or upcoming challenges discoverable from the supported source list.

The initial release should not contain placeholder or fabricated challenge data.

Every production record must be either:

- verified from an official source;
- or clearly marked manually entered with provenance.

---

# 68. Implementation Order

Implement in this order.

## Stage 1 — Foundation

- repo;
- Next.js;
- database;
- migrations;
- auth for admin;
- schemas;
- logging;
- seed venue taxonomy.

## Stage 2 — Public Product

- homepage;
- challenge cards;
- countdown;
- detail pages;
- venue pages;
- search;
- filters;
- responsive UI;
- SEO.

Use controlled seed data initially.

## Stage 3 — Crawler Framework

- source interface;
- source registry;
- HTTP fetch;
- Playwright fallback;
- retry;
- rate limiting;
- date parser;
- normalization;
- dedupe;
- idempotent upsert;
- provenance.

## Stage 4 — High-Priority Sources

Implement Priority A sources completely.

## Stage 5 — Admin & Operations

- edit challenge;
- overrides;
- source health;
- manual crawl;
- dry run;
- crawl history;
- anomaly detection.

## Stage 6 — Remaining Sources

Implement Priority B and C.

## Stage 7 — Production Hardening

- Sentry;
- backup verification;
- security review;
- load test;
- SEO;
- accessibility;
- stale-data review;
- operational docs.

---

# 69. Definition of Done

The final production system must satisfy all of the following.

### Product

- users can browse academic AI challenges;
- users can identify conference affiliation;
- users can see deadlines and countdowns;
- users can open official source pages;
- users can filter and search effectively.

### Data

- records are traceable;
- stale records are identifiable;
- manual corrections persist;
- yearly editions are automatically discovered.

### Reliability

- upstream failure does not erase data;
- one broken adapter does not break the job;
- duplicate runs are safe;
- broken parser output is detectable.

### Operations

- crawler status is inspectable;
- errors are logged;
- manual reruns are possible;
- backups exist;
- deployment is repeatable.

### Maintainability

- adapters are isolated;
- fixtures exist;
- adding a venue is documented;
- no unnecessary distributed infrastructure.

---

# 70. Final Implementation Constraints for Codex

Codex should follow these rules while implementing:

1. Do not reduce the project to a throwaway MVP.
2. Do not over-engineer with microservices.
3. Treat crawler reliability and data provenance as core product requirements.
4. Do not make LLM access mandatory.
5. Do not create a generic "AI crawler" in place of source adapters.
6. Preserve manually corrected data.
7. Never automatically delete challenge records based on a failed crawl.
8. Build idempotent update logic.
9. Make yearly edition discovery part of the adapter design.
10. Use official sources whenever possible.
11. Add tests for every source adapter.
12. Add operational documentation.
13. Do not stop after creating only UI + mock data.
14. Do not stop after implementing only 2-3 sources.
15. Treat the full configured venue registry as the production target.
16. Keep the public product simple: tracking, timelines, deadlines, countdowns, official links.
17. Keep complex intelligence out unless separately requested.
18. Prefer predictable, maintainable code over clever abstraction.

---

# 71. Product Summary

The finished product should feel like:

> **AI Deadlines for academic AI challenges**

but with:

- official-source provenance;
- daily automatic refresh;
- automatic year rollover;
- conference-aware challenge organization;
- production-grade crawler reliability;
- simple and fast browsing.

The application should be useful to a research team every day without requiring someone to manually check dozens of conference websites.
