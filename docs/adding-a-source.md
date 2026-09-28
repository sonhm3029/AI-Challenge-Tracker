# Adding a new source

Adding a normal source should never require changes to core application
code — only new files. This walks through the steps (Section 64 of the
product spec) using a hypothetical `example` adapter.

## 1. Research the real site first

Before writing any code, find the actual live page(s) for the
venue/challenge series and decide which discovery strategy fits (Section
11):

- **Predictable URLs** — `https://example.org/{year}/` resolves cleanly for
  a range of years (see `scrapers/recsys.ts`, `scrapers/cvpr.ts`).
- **Stable archive/homepage** — one page lists every year's edition (see
  `scrapers/semeval.ts`).
- **Stable index** — the source isn't year-partitioned at all, e.g. a
  platform's live challenge directory (see `scrapers/miccai.ts`).
- **Conference navigation discovery** — search the official site for links
  containing "challenge"/"competition"/"cup"/"shared task"/"grand
  challenge"/"benchmark"/"contest" (see `scrapers/cvpr.ts`,
  `lib/scraping/extractLinks.ts`'s `filterChallengeLikeLinks`).
- **Manual mapping** — the site's naming is inconsistent year to year (see
  `scrapers/wsdm.ts`, `scrapers/kdd.ts`). This is valid and often more
  reliable than fragile heuristics — don't fight a site that won't cooperate.

Save at least one real fixture HTML/JSON file while you're there:

```bash
curl -s -L -A "AcademicChallengeTracker/1.0" -o tests/fixtures/example/2027.html \
  https://example.org/2027/
```

Never fabricate a fixture — every field the adapter extracts should trace
back to something you actually fetched.

## 2. Implement the adapter

Create `scrapers/example.ts` implementing `ChallengeSourceAdapter` from
`scrapers/types.ts`:

```ts
export const exampleAdapter: ChallengeSourceAdapter = {
  sourceId: "example",
  venueSlug: "example-venue",

  async discoverEditions(context) {
    /* … */
  },

  async fetchChallenges(edition, context) {
    /* … */
  },
};
```

Reuse the shared libraries rather than reinventing them:

| Concern | Helper |
| --- | --- |
| Fetching with retry/backoff/rate-limit | `lib/scraping/fetchHtml.ts` |
| JS-rendered pages (last resort) | `lib/scraping/fetchRenderedHtml.ts` |
| Date parsing (AoE, UTC, date-only, etc.) | `lib/scraping/parseDates.ts` |
| "Important Dates" tables/lists | `lib/scraping/extractImportantDates.ts` |
| Mapping a date label to a challenge field | `lib/scraping/classifyMilestone.ts` |
| Classifying links (Codabench/GitHub/dataset/…) | `lib/scraping/detectPlatformLinks.ts` |
| URL normalization | `lib/scraping/normalizeUrl.ts` |
| Predictable-year-URL discovery | `lib/scraping/discoverPredictableEditions.ts` |

`domains` must be names from the seeded taxonomy (Section 9.6) —
`lib/taxonomy.ts` silently drops (and logs) anything else rather than
polluting the domain list. Check `db/seedData.ts` for the exact list.

Every adapter is expected to have its own bespoke date-label mapping for
whatever a site's actual wording is (see the comment in
`lib/scraping/classifyMilestone.ts`) — the shared classifier is a
convenience, not a guarantee.

## 3. Add fixtures + tests

Create `tests/adapters/example.test.ts` following the pattern in
`tests/adapters/wsdm.test.ts`:

- Stub `fetch` with `stubFetchWithFixtures` from
  `tests/fixtures/serveFixture.ts` — tests must never hit the live network
  (Section 44).
- Assert: edition discovery, challenge count, title extraction, URL
  extraction, and date extraction (Section 44's required assertions).

Run it:

```bash
npx vitest run tests/adapters/example.test.ts
```

## 4. Register the adapter

Add one line to `scrapers/registry.ts`:

```ts
import { exampleAdapter } from "@/scrapers/example";
// …
const adapters: ChallengeSourceAdapter[] = [
  // …
  exampleAdapter,
];
```

## 5. Add the `source_series` entry

Add a row to `SOURCE_SERIES` in `db/seedData.ts` (and a `VENUES` entry if
the venue doesn't exist yet), with `adapterName` matching `sourceId`
exactly, and `enabled: false` until you've validated it (next step).

Then re-run the seed against your target database:

```bash
npm run db:seed
```

## 6. Dry-run before enabling

```bash
npm run crawl:dry-run -- example
```

This runs the real adapter and prints what it *would* do without writing
anything to the database (Section 60). Review the output carefully — new
challenges, field diffs on updates, and any "uncertain duplicate" entries
that would be preserved separately for admin review rather than merged
(Section 17).

## 7. Enable it

Once the dry run looks right, flip `enabled: true` for the source in
`db/seedData.ts`, re-seed, and let the next scheduled crawl (or
`npm run crawl:source -- example`) pick it up. Watch `/admin/sources` and
`/admin/crawl-runs` for its first few real runs.
