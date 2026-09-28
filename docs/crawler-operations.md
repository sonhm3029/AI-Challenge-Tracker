# Crawler operations

## Daily schedule

`.github/workflows/daily-crawl.yml` runs `npm run crawl:all` at 03:00 UTC
every day (Section 20), then `npm run reconcile:stale` and
`npm run health:report`. It can also be triggered manually from the Actions
tab ("Run workflow") or via `npm run crawl:all` locally against a target
`DATABASE_URL`.

An HTTP alternative exists at `POST /api/cron/crawl` (Section 38), guarded
by `Authorization: Bearer $CRON_SECRET`. GitHub Actions is the primary path
(persistent logs, manual reruns, independent of the frontend deploy); the
HTTP endpoint exists for platforms that only offer HTTP-based cron, or for
ad-hoc triggers.

## Operational commands

```bash
npm run crawl:all                    # run every enabled source (Section 20)
npm run crawl:source -- <name>       # run one source (matches adapter_name or source slug)
npm run crawl:dry-run -- <name>      # same, but prints a diff and writes nothing (Section 60)
npm run validate:sources             # read-only sanity check: every enabled adapter resolves
npm run reconcile:stale              # report challenges not seen in 30/90+ days (Section 19)
npm run health:report                # print source health + fire ALERT log lines (Section 21/40)
npm run db:migrate                   # apply migrations (Section 42 — never hand-edit prod schema)
npm run db:seed                      # idempotent: venues, domains, task tags, source registry
```

`<name>` for `crawl:source`/`crawl:dry-run` matches either
`source_series.adapter_name` (e.g. `wsdm`, `recsys`) or `source_series.slug`
(e.g. `wsdm-cup`, `recsys-challenge`).

## Reading a crawl run

`/admin/crawl-runs` lists every run with status (`running` /
`success` / `partial_success` / `failed`), editions discovered, and record
counts. `partial_success` means either:

- the data-quality anomaly check fired (Section 48 — e.g. record count
  dropped >80% vs. the previous successful run, or a source with
  discovered editions parsed zero records), or
- some individual records failed to process while others succeeded.

Either way, **no existing data is ever erased** because of a bad crawl —
worst case, a run simply doesn't add/update anything for that source. Check
`error_summary` on the run and `last_error` on the source
(`/admin/sources`) for the specifics.

## Source health

`/admin/sources` and the dashboard at `/admin` show, per source:

- **Healthy** — most recent run succeeded.
- **Warning** — 1-2 consecutive failures, or the source has never run yet.
- **Failing** — ≥3 consecutive failures. This is also the condition
  `checkAlertConditions()` in `jobs/healthReport.ts` fires an `ALERT` log
  line for (Section 40).
- **Disabled** — `enabled = false` in `source_series` (Priority B/C sources
  ship disabled until their adapters are implemented — see
  `docs/adding-a-source.md`).

Wiring `ALERT` log lines to an actual notification channel (email, Slack,
PagerDuty) is a small follow-up once real delivery credentials exist; the
detection logic is what matters for production readiness, and
`.github/workflows/daily-crawl.yml` already opens a GitHub issue when the
whole scheduled job fails outright.

## Manual corrections

Every field an admin edits at `/admin/challenges/[id]` becomes a
`field_overrides` row (Section 9.11) and is applied to the live row
immediately. A future crawl will **never** overwrite an overridden field —
`lib/overrides.ts`'s `stripOverriddenFields` filters them out of every
crawler write. Clear an override from the same page to let the crawler
manage that field again.

## Deletion policy

Challenges are never hard-deleted because a crawl stops seeing them
(Section 19) — a broken adapter, a site redesign, or a moved page are all
indistinguishable from a genuinely archived challenge at crawl time.
Staleness is derived from `last_seen_at` at read time (`reconcileStaleRecords`
in `jobs/reconcileStaleRecords.ts`) rather than a stored flag; an admin
decides whether to hide (`is_hidden`) or archive (`is_active = false`) a
challenge that's genuinely gone.

## Local development database

```bash
docker compose up -d          # Postgres on localhost:5544 (see docker-compose.yml)
npm run db:migrate
npm run db:seed
```

`.env.example` documents every required environment variable. Copy it to
`.env` for local development. Tests default `DATABASE_URL` to a separate
`challenge_tracker_test` database (see `tests/setupEnv.ts`) — never point
tests at a production database (Section 61).

## Deployment

Recommended (Section 62): Vercel (frontend) + a managed Postgres provider
(Supabase or equivalent) + GitHub Actions (crawler + CI). See
`.github/workflows/deploy.yml` for the migrate-then-deploy pipeline —
it needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and a
production `DATABASE_URL` configured as repository or `production` environment
secrets. Configure the same production database and app secrets in Vercel.
Then set the repository variable `PRODUCTION_ENABLED` to `true` under
Settings → Secrets and variables → Actions → Variables. Until then, deploy
and daily crawl jobs are skipped; CI still runs on every push. Once enabled,
run Deploy manually from the Actions tab or push to `main`. The workflow checks
all required secrets before touching the database, then runs migrations and the
idempotent taxonomy/source seed before deploying. Run Daily crawl manually once
after the first deployment to populate challenge records. Take a database snapshot before any migration
that changes existing columns (Section 41) — the workflow includes a
reminder step, but the actual snapshot call is provider-specific and isn't
wired up here.

`vercel.json` places Vercel Functions in Singapore next to the Neon database
and disables Vercel's Git-triggered deployment for `main`. If the GitHub
integration is connected, preview branches can still deploy automatically;
production deployments continue through the migrate-then-deploy Action.
