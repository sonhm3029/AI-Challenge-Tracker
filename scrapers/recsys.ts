import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks } from "@/lib/scraping/extractLinks";
import { detectPlatformLinks, detectHostPlatform } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import { classifyMilestoneLabel } from "@/lib/scraping/classifyMilestone";
import { discoverPredictableEditions } from "@/lib/scraping/discoverPredictableEditions";
import type { ParsedDate } from "@/lib/dates/parsedDate";
import type { ChallengeLinkType } from "@/db/schema";
import type {
  ChallengeSourceAdapter,
  ScrapedChallenge,
  ScrapedChallengeLink,
  SourceEditionCandidate,
  CrawlContext,
} from "@/scrapers/types";

/**
 * RecSys Challenge (ACM RecSys).
 *
 * Discovery strategy: predictable URLs (Section 11.1). Every edition lives
 * at `https://www.recsyschallenge.com/{year}/` — verified live for 2023,
 * 2024, 2025 and 2026 (each returns HTTP 200 with a distinct
 * `<title>RecSys Challenge {year}</title>`), while `/2027/` currently 404s.
 * The bare root domain is a client-side meta-refresh to the current year's
 * edition, so we probe the year path directly rather than following it.
 *
 * Unlike WSDM Cup, RecSys Challenge keeps one stable domain year over year,
 * but the *task itself* changes completely every edition (different
 * organizers, different host platform — Codabench, a bespoke Synerise site,
 * etc.) — so very little about page structure beyond the "Timeline" table
 * shape can be assumed to hold indefinitely.
 */
const BASE_URL = "https://www.recsyschallenge.com";

type DateField = keyof Pick<
  ScrapedChallenge,
  | "registrationStart"
  | "registrationDeadline"
  | "challengeStart"
  | "challengeEnd"
  | "submissionDeadline"
  | "evaluationStart"
  | "evaluationEnd"
  | "workshopDate"
>;

type TimelineRow = {
  label: string;
  rawDateText: string;
  cleanDateText: string;
};

/**
 * The RecSys Challenge "Timeline" table (`#dates table`) lists rows as
 * (date, description) — the reverse of the (label, date) shape that
 * `extractLabeledDatesFromTables` expects — and some years strike through a
 * superseded date with `<s>...</s>` right next to the current one (in either
 * order). Bespoke here because it's this site's own table shape, same as
 * WSDM's file handles its own site's peculiar date-first `<li>` list.
 */
function extractTimelineRows($: CheerioAPI): TimelineRow[] {
  const rows: TimelineRow[] = [];
  $("#dates table tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length < 2) return;

    const dateCell = $(cells[0]).clone();
    dateCell.find("s").remove(); // drop superseded/struck-through dates
    const rawDateText = dateCell.text().replace(/\s+/g, " ").trim();
    const label = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!rawDateText || !label || !/\d/.test(rawDateText)) return;

    // parseHumanDate has no "D Month, YYYY" (day-first with comma) format,
    // which is exactly how this site writes every date (e.g. "9 July,
    // 2026"); left as-is it falls through to the native Date() fallback,
    // which resolves in the *host machine's* local timezone — nondeterministic
    // across environments. Stripping the comma lets it match the existing
    // "d MMMM yyyy" format instead, which resolves deterministically in UTC.
    const cleanDateText = rawDateText.replace(/,/g, "");

    rows.push({ label, rawDateText, cleanDateText });
  });
  return rows;
}

/**
 * classifyMilestoneLabel() expects wording like "challenge begins" /
 * "challenge ends"; this site instead writes "Start of the RecSys
 * Challenge" / "End of the RecSys Challenge" (subject-first), plus a couple
 * of its own recurring phrasings ("Code upload deadline", "Blind B final
 * phase opens"). Verified against both the 2025 and 2026 timelines, so this
 * is the site's own recurring convention, not a single-year one-off.
 */
function classifyRecsysMilestone(label: string): DateField | null {
  const generic = classifyMilestoneLabel(label);
  if (generic) return generic;

  if (/code upload/i.test(label)) return "submissionDeadline";
  if (/final phase (opens|begins|starts)/i.test(label)) return "evaluationStart";
  if (/^end\s+(of\s+)?(the\s+)?.*challenge/i.test(label)) return "challengeEnd";
  if (/^start\s+(of\s+)?(the\s+)?.*challenge/i.test(label)) return "challengeStart";
  return null;
}

function buildTimelineDateFields(rows: TimelineRow[]): Partial<Record<DateField, ParsedDate>> {
  const result: Partial<Record<DateField, ParsedDate>> = {};
  for (const row of rows) {
    const field = classifyRecsysMilestone(row.label);
    if (!field || result[field]) continue;
    const parsed = parseHumanDate(row.cleanDateText);
    if (parsed.value) {
      // Keep the real source text (with its original comma/strikethrough
      // already resolved) for provenance, even though a cleaned copy was
      // used to actually parse the value.
      result[field] = { ...parsed, originalText: row.rawDateText };
    }
  }
  return result;
}

const RELEVANT_LINK_TYPES = new Set<ChallengeLinkType>([
  "platform",
  "github",
  "dataset",
  "registration",
  "leaderboard",
  "workshop",
  "rules",
]);

function buildLinks($: CheerioAPI, editionUrl: string): ScrapedChallengeLink[] {
  const officialNormalized = normalizeUrl(editionUrl);
  const allLinks = extractAllLinks($, editionUrl).filter((link) => link.href !== officialNormalized);
  const detected = detectPlatformLinks(allLinks);

  return detected
    .filter((d) => RELEVANT_LINK_TYPES.has(d.linkType))
    .map((d) => ({
      label: d.link.text || d.hostPlatform || d.linkType,
      type: d.linkType,
      url: d.link.href,
    }));
}

/**
 * The task changes every year, but recurring wording ("conversational",
 * "dialogue", "LLM-as-a-Judge") on the page itself is a reasonable signal
 * for whether that edition also touches NLP/LLM territory, beyond the
 * "Recommender Systems" domain every edition gets by definition.
 */
function inferDomains(pageText: string): string[] {
  const domains = ["Recommender Systems"];
  if (/conversation|dialogue|natural language/i.test(pageText)) domains.push("NLP");
  if (/\bllm\b|large language model/i.test(pageText)) domains.push("LLM");
  return domains;
}

export const recsysChallengeAdapter: ChallengeSourceAdapter = {
  sourceId: "recsys",
  venueSlug: "recsys",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    return discoverPredictableEditions(context.now, {
      buildUrl: (year) => `${BASE_URL}/${year}/`,
      validate: (html) => /recsys challenge/i.test(html),
    });
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const result = await fetchHtml(edition.url);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);

    const pageTitle = $("title").first().text().trim();
    const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
    let name = pageTitle || `RecSys Challenge ${edition.year}`;
    if (metaDescription.length > pageTitle.length && metaDescription.toLowerCase().startsWith(pageTitle.toLowerCase())) {
      name = metaDescription.replace(/\s*-\s*/, ": ");
    }

    const description = $("p")
      .filter((_, el) => $(el).text().replace(/\s+/g, " ").trim().length > 120)
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const links = buildLinks($, edition.url);
    const hostPlatform = detectHostPlatform(extractAllLinks($, edition.url));

    const timelineRows = extractTimelineRows($);
    const dateFields = buildTimelineDateFields(timelineRows);

    const bodyText = $("body").text();
    const domains = inferDomains(bodyText);

    const challenge: ScrapedChallenge = {
      externalKey: `recsys-${edition.year}`,
      name,
      venueSlug: "recsys",
      venueYear: edition.year,
      officialUrl: normalizeUrl(edition.url),
      sourceUrl: normalizeUrl(edition.url),
      description: description || undefined,
      hostPlatform,
      domains,
      links,
      ...dateFields,
    };

    return [challenge];
  },
};
