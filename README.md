# Academic AI Challenge Tracker

A production-oriented tracker for academic AI/ML challenges, competitions,
cups, and shared tasks across major research venues — deadlines,
countdowns, official links, and provenance, refreshed daily from official
sources. Full product spec: [`academic_ai_challenge_tracker_production_spec.md`](./academic_ai_challenge_tracker_production_spec.md).

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS, PostgreSQL via
Drizzle ORM, `cheerio`/`fetch` for scraping (Playwright as an opt-in
fallback for JS-rendered pages), Vitest for tests, GitHub Actions for CI
and the scheduled crawler.

## Quickstart

```bash
cp .env.example .env
docker compose up -d        # Postgres on localhost:5544
npm install
npm run db:migrate
npm run db:seed             # venues, domains, task tags, source registry
npm run dev                 # http://localhost:3000
```

Populate real data by running the crawler once:

```bash
npm run crawl:all
```

Admin console: `/admin` (password from `ADMIN_PASSWORD` in `.env`).

## Repository layout

```text
app/              Next.js routes: public site + /admin console + /api
components/       Shared UI (ChallengeCard, Countdown, Timeline, …)
lib/              Domain logic: dates, status, dedupe, normalize, queries, taxonomy
lib/scraping/     Shared crawler utilities (fetch, rate limit, date/link parsing)
scrapers/         One adapter per source (Section 10 contract in scrapers/types.ts)
jobs/             Crawl orchestration: updateAllSources, updateSource, dryRun, health
db/               Drizzle schema, migrations, seed data
scripts/          CLI entry points (crawl a single source, dry-run, validate, import)
tests/            unit/, adapters/ (fixture-based), integration/, fixtures/
docs/             Adding a source, crawler operations, data model
.github/workflows CI, daily crawl, deploy
```

## Key commands

```bash
npm run dev / build / start
npm run typecheck / lint / test
npm run crawl:all                  # run every enabled source
npm run crawl:source -- <name>     # run one source
npm run crawl:dry-run -- <name>    # parse + diff, write nothing
npm run validate:sources           # read-only sanity check across all adapters
npm run reconcile:stale            # report challenges not seen in 30/90+ days
npm run health:report              # source health + ALERT log lines
npm run db:migrate / db:seed
```

See `docs/crawler-operations.md` for the full operational runbook and
`docs/adding-a-source.md` for how to add a new venue/challenge series
without touching core application code.

## Status

Priority A sources (Section 34) are implemented and live-validated:
NeurIPS Competitions, WSDM Cup, KDD Cup, RecSys Challenge, SemEval, ICASSP
SP Grand Challenges, MICCAI/Grand-Challenge.org, CVPR. Priority B/C venues
are seeded in the registry (`db/seedData.ts`) but disabled pending adapter
implementation — see `docs/adding-a-source.md`.
