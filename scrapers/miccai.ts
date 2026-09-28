import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import type { ChallengeSourceAdapter, ScrapedChallenge, SourceEditionCandidate, CrawlContext } from "@/scrapers/types";

/**
 * Grand-Challenge.org (mostly MICCAI-affiliated, but also hosts ISBI/MIDL
 * medical-imaging challenges).
 *
 * Discovery strategy: Section 11.2/11.3 "stable index" — unlike a
 * conference site that publishes one URL per year, grand-challenge.org
 * exposes a single, continuously-updated, filterable index of challenges at
 * https://grand-challenge.org/challenges/ that is never "versioned" by year.
 * There is no per-year edition to discover. Rather than force a fake
 * per-year URL pattern onto a source that doesn't have one (Section 11.5:
 * "manual mapping is valid and preferable to fragile automation" when a
 * source doesn't fit the yearly-edition mold), we model this source as a
 * single synthetic edition representing "the current snapshot of the
 * index", keyed by the year the crawl runs. Each individual challenge's own
 * year (where determinable) is still recorded on `venueYear`.
 *
 * Fetch strategy: the human-facing /challenges/ page is a JavaScript SPA
 * that renders its list client-side — curling it returns an (almost) empty
 * shell with no challenge data in the initial HTML. However the site is
 * backed by a Django REST Framework API that the SPA itself calls, and it
 * is public and unauthenticated: GET
 * https://grand-challenge.org/api/v1/challenges/?limit=300 returns every
 * challenge (page count as of this writing: 264, comfortably under one
 * page at limit=300) as JSON with slug/title/description/status/
 * start_date/end_date/url fields. That JSON API is what this adapter
 * fetches — far more reliable than scraping the rendered DOM, and no
 * headless browser (Playwright) is needed at all.
 *
 * The API's `status` field distinguishes OPEN / OPEN_SOON / CLOSED /
 * COMPLETED challenges. Per the assignment's framing of the index as
 * "active/upcoming", we only surface OPEN and OPEN_SOON challenges here.
 */
const CHALLENGES_INDEX_URL = "https://grand-challenge.org/challenges/";
const API_URL = "https://grand-challenge.org/api/v1/challenges/?limit=300";
const ACTIVE_STATUSES = new Set(["OPEN", "OPEN_SOON"]);

// Grand-Challenge.org hosts almost exclusively medical-imaging challenges
// (segmentation, detection, classification over CT/MRI/histopathology/
// endoscopy/etc.), so every challenge from this source is tagged Medical AI
// + Computer Vision by default. A handful of challenges are text/report
// oriented (e.g. "DRAGON": Diagnostic Report Analysis, General Optimization
// of NLP) and additionally get tagged NLP when their title/description says
// so.
const NLP_RE = /\bnlp\b|natural language|report generation|language model/i;

type GrandChallengeApiEntry = {
  api_url: string;
  url: string;
  slug: string;
  title: string;
  description: string;
  public: boolean;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created: string;
  modified: string;
};

type GrandChallengeApiResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: GrandChallengeApiEntry[];
};

/**
 * Best-effort year for a challenge that doesn't state one explicitly via
 * start_date: many grand-challenge.org slugs/titles encode the year, either
 * as a full 4-digit year ("TopBrain2026") or a 2-digit suffix
 * ("HECKTOR26", "RARE26"). Falls back to the crawl year when neither is
 * present.
 */
function deriveYear(entry: GrandChallengeApiEntry, fallbackYear: number): number {
  if (entry.start_date) {
    const year = new Date(entry.start_date).getUTCFullYear();
    if (!Number.isNaN(year)) return year;
  }

  const haystack = `${entry.slug} ${entry.title}`;
  const fourDigit = haystack.match(/\b(20\d{2})\b/);
  if (fourDigit) return Number(fourDigit[1]);

  const twoDigitSuffix = haystack.match(/(\d{2})\s*$/);
  if (twoDigitSuffix) return 2000 + Number(twoDigitSuffix[1]);

  return fallbackYear;
}

function buildDomains(entry: GrandChallengeApiEntry): string[] {
  const domains = ["Medical AI", "Computer Vision"];
  const haystack = `${entry.title} ${entry.description}`;
  if (NLP_RE.test(haystack)) domains.push("NLP");
  return domains;
}

export const grandChallengeAdapter: ChallengeSourceAdapter = {
  sourceId: "grand-challenge",
  venueSlug: "miccai",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    const currentYear = context.now.getUTCFullYear();
    return [
      {
        year: currentYear,
        url: CHALLENGES_INDEX_URL,
        metadata: { apiUrl: API_URL },
      },
    ];
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const apiUrl = (edition.metadata?.apiUrl as string | undefined) ?? API_URL;
    const result = await fetchHtml(apiUrl, { headers: { Accept: "application/json" } });
    if (!result.ok) return [];

    let parsed: GrandChallengeApiResponse;
    try {
      parsed = JSON.parse(result.html) as GrandChallengeApiResponse;
    } catch {
      return [];
    }

    const activeEntries = (parsed.results ?? []).filter((entry) => ACTIVE_STATUSES.has(entry.status));

    return activeEntries.map((entry): ScrapedChallenge => {
      const officialUrl = normalizeUrl(entry.url);
      const sourceUrl = normalizeUrl(entry.api_url);
      const name = entry.title?.trim() || entry.slug;
      const description = entry.description?.trim() || undefined;

      return {
        externalKey: `grand-challenge-${entry.slug}`,
        name,
        shortName: entry.slug,
        description,
        venueSlug: "miccai",
        venueYear: deriveYear(entry, edition.year),
        officialUrl,
        sourceUrl,
        hostPlatform: "Grand-Challenge.org",
        links: [{ label: "Grand-Challenge.org", type: "platform", url: "https://grand-challenge.org/" }],
        challengeStart: entry.start_date ? parseHumanDate(entry.start_date) : undefined,
        challengeEnd: entry.end_date ? parseHumanDate(entry.end_date) : undefined,
        domains: buildDomains(entry),
        rawPayload: entry,
      };
    });
  },
};
