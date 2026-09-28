import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks, filterChallengeLikeLinks, type DiscoveredLink } from "@/lib/scraping/extractLinks";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import { classifyMilestoneLabel } from "@/lib/scraping/classifyMilestone";
import { detectPlatformLinks } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl, getRegistrableDomain } from "@/lib/scraping/normalizeUrl";
import { discoverPredictableEditions } from "@/lib/scraping/discoverPredictableEditions";
import type { ParsedDate } from "@/lib/dates/parsedDate";
import type { ChallengeSourceAdapter, ScrapedChallenge, ScrapedChallengeLink, SourceEditionCandidate, CrawlContext } from "@/scrapers/types";

/**
 * CVPR (workshop-affiliated challenges).
 *
 * CVPR itself does not run challenges directly: cvpr.thecvf.com has no
 * single stable "challenges" index the way grand-challenge.org does for
 * MICCAI. Almost every CVPR "challenge" is really a workshop-affiliated
 * competition (NTIRE, UG2+, VizWiz Grand Challenge, GigaBrain Challenge,
 * ...) that lives on its own independently-run site chosen by that
 * workshop's organizers.
 *
 * Discovery strategy actually used here (verified against the live site on
 * 2026-09-28):
 *
 * 1. Section 11.1 predictable URL — each year's full workshop program is
 *    published at a predictable `cvpr.thecvf.com/Conferences/{year}/Workshops`
 *    URL (`discoverPredictableEditions`). Older years get taken down (2025's
 *    copy already 404s as of this writing), so this always probes a small
 *    window around the current year rather than assuming history is kept.
 * 2. Section 11.4 conference navigation discovery — that Workshops page is a
 *    single big table of every accepted workshop with a "Project Page" link
 *    per row. We reuse `filterChallengeLikeLinks` to keep only the rows
 *    whose title or linked URL mentions challenge/competition/contest/grand
 *    challenge. On the real 2026 page this cleanly isolates exactly three
 *    real, currently-live workshop-affiliated challenges out of ~150
 *    workshops: "The 8th UG2+ Workshop and Challenge", "GigaBrain Challenge
 *    2026", and the "VizWiz Grand Challenge" — with no false positives.
 *    This is still source-local discovery: we only ever follow links already
 *    published on the official cvpr.thecvf.com page for that year.
 * 3. Each matched workshop's own official page is then fetched directly for
 *    the actual challenge details. These pages have no shared template (one
 *    is a static Bootstrap site, one a Tailwind single-pager, one a WordPress
 *    blog), so date-label wording is normalized per-page below on top of the
 *    shared `classifyMilestoneLabel` rules, per that module's own guidance
 *    that adapters should special-case a site's exact wording when known
 *    (Section 11.5 — manual mapping/special-casing is preferable to fragile
 *    one-size-fits-all automation once a source is this inconsistent).
 *
 * NTIRE itself (probably the best-known recurring CVPR-affiliated challenge
 * umbrella) was deliberately *not* hardcoded here even though it was easy to
 * find via web search: its own site (cvlai.net/ntire/{year}) isn't linked
 * from the CVPR Workshops table's "Project Page" column the same way (the
 * table lists an intermediate GitHub-pages workshop site instead), so
 * including it would have meant abandoning conference-navigation discovery
 * for a hardcoded guess. It's a natural next entry for the manual-mapping
 * fallback below if a future crawl run finds `discoverEditions` coming back
 * emptier than expected.
 */

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

type DateFields = Partial<Record<DateField, ParsedDate>>;

function workshopsUrl(year: number): string {
  return `https://cvpr.thecvf.com/Conferences/${year}/Workshops`;
}

type WorkshopEntry = { title: string; url: string };

/**
 * Section 11.4 — parses the CVPR Workshops table (`<tr><td><strong>title
 * </strong><a class="elc-project-link">Project Page</a></td>...</tr>`) and
 * keeps only the rows that look like a challenge/competition, using the
 * shared keyword filter over both the workshop's title and its linked URL.
 */
function extractChallengeWorkshops($: CheerioAPI, baseUrl: string): WorkshopEntry[] {
  const rows: { title: string; href: string }[] = [];
  $("a.elc-project-link[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const title = $(el).closest("td").find("strong").first().text().replace(/\s+/g, " ").trim();
    rows.push({ title, href: normalizeUrl(href, baseUrl) });
  });

  const asLinks: DiscoveredLink[] = rows.map((r) => ({ text: r.title, href: r.href }));
  const keep = new Set(filterChallengeLikeLinks(asLinks).map((l) => l.href));

  const seen = new Set<string>();
  const entries: WorkshopEntry[] = [];
  for (const row of rows) {
    if (!keep.has(row.href) || seen.has(row.href)) continue;
    seen.add(row.href);
    entries.push({ title: row.title, url: row.href });
  }
  return entries;
}

/**
 * CVPR-specific label normalization layered on top of the shared
 * `classifyMilestoneLabel` rules (see file doc comment there: "adapters
 * should still special-case a site's exact wording when known"). Real
 * wording on these three sites ("Registration Open", "Challenge End",
 * "Competition Kickoff", ...) is close to but not an exact match for the
 * shared rules' plural/verb forms, so a small set of overrides is checked
 * first. Paper/abstract submission labels (the workshop's academic track,
 * not the challenge task) are explicitly excluded so they never get
 * conflated with a challenge's own submission deadline.
 */
function classifyCvprLabel(label: string): DateField | null {
  if (/paper submission|abstract/i.test(label)) return null;

  const overrides: [RegExp, DateField][] = [
    [/registration open/i, "registrationStart"],
    [/challenge end\b/i, "challengeEnd"],
    [/challenges? go live/i, "challengeStart"],
    [/competition (kickoff|begins?|starts?)/i, "challengeStart"],
    [/challenge submissions? due/i, "submissionDeadline"],
    [/half-day workshop|workshop day/i, "workshopDate"],
    [/public announcement of .*winners?/i, "evaluationEnd"],
  ];
  for (const [re, field] of overrides) {
    if (re.test(label)) return field;
  }
  return classifyMilestoneLabel(label);
}

/**
 * Many of these pages state a milestone's month/day but never repeat the
 * year (it's implied by the page itself being titled e.g. "GigaBrain
 * Challenge 2026" or "2026 VizWiz Grand Challenge Workshop"), and some
 * prefix a weekday name luxon's formats don't expect ("Thursday, June 4").
 * This strips both before parsing and falls back to the edition's own year
 * — never a fabricated date, just the year the page's own title already
 * states.
 */
function parseWithYearFallback(dateText: string, fallbackYear: number): ParsedDate {
  const cleaned = dateText
    .replace(/^[A-Za-z]+,\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  const withYear = /\d{4}/.test(cleaned) ? cleaned : `${cleaned}, ${fallbackYear}`;
  return parseHumanDate(withYear);
}

function setField(fields: DateFields, field: DateField | null, dateText: string, fallbackYear: number): void {
  if (!field || fields[field]) return;
  const parsed = parseWithYearFallback(dateText, fallbackYear);
  if (parsed.value) fields[field] = parsed;
}

/** UG2+ Challenge: "Important Dates" is a row of `.count-item` blocks, each
 * an `<h4>` label followed by an `<h5>` date — no shared table/list shape. */
function extractUg2Dates($: CheerioAPI, year: number): DateFields {
  const fields: DateFields = {};
  $(".count-item").each((_, el) => {
    const label = $(el).find("h4").first().text().replace(/\s+/g, " ").trim();
    const dateText = $(el).find("h5").first().text().replace(/\s+/g, " ").trim();
    if (!label || !dateText) return;
    setField(fields, classifyCvprLabel(label), dateText, year);
  });
  return fields;
}

/** GigaBrain Challenge: a vertical timeline of sibling divs, date first
 * ("Mid-March") then a `<h4>` label in the next sibling. */
function extractGigaBrainDates($: CheerioAPI, year: number): DateFields {
  const fields: DateFields = {};
  $('div[class*="w-32"][class*="font-bold"]').each((_, el) => {
    const dateText = $(el).text().replace(/\s+/g, " ").trim();
    const label = $(el).next().find("h4").first().text().replace(/\s+/g, " ").trim();
    if (!label || !dateText) return;
    setField(fields, classifyCvprLabel(label), dateText, year);
  });
  return fields;
}

/** VizWiz Grand Challenge: a plain WordPress `<ul><li>Label: Date</li></ul>`
 * under an "Important Dates" heading — closest to the shared line format,
 * but dates omit the year and carry a leading weekday, so it's parsed here
 * rather than via `extractLabeledDatesFromLines`. */
function extractVizWizDates($: CheerioAPI, year: number): DateFields {
  const fields: DateFields = {};
  const heading = $("h1, h2, h3").filter((_, el) => /important dates/i.test($(el).text()));
  const list = heading.first().nextAll("ul").first();
  list.find("li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const sep = text.indexOf(":");
    if (sep === -1) return;
    const label = text.slice(0, sep).trim();
    const dateText = text.slice(sep + 1).trim();
    setField(fields, classifyCvprLabel(label), dateText, year);
  });
  return fields;
}

/** Fallback used for any future workshop that isn't one of the three
 * manually-tuned sites above: best-effort generic label/date table parse. */
function extractGenericDates($: CheerioAPI, year: number): DateFields {
  const fields: DateFields = {};
  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length < 2) return;
    const label = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const dateText = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!label || !dateText || !/\d/.test(dateText)) return;
    setField(fields, classifyCvprLabel(label), dateText, year);
  });
  return fields;
}

type KnownChallenge = {
  urlPattern: RegExp;
  domains: string[];
  extractDates: ($: CheerioAPI, year: number) => DateFields;
};

const KNOWN_CHALLENGES: KnownChallenge[] = [
  { urlPattern: /ug2challenge\.github\.io/i, domains: ["Computer Vision"], extractDates: extractUg2Dates },
  { urlPattern: /gigaai-research\.github\.io/i, domains: ["Computer Vision", "Robotics"], extractDates: extractGigaBrainDates },
  { urlPattern: /vizwiz\.org/i, domains: ["Computer Vision", "Multimodal"], extractDates: extractVizWizDates },
];

function lookupKnownChallenge(url: string): KnownChallenge {
  return (
    KNOWN_CHALLENGES.find((k) => k.urlPattern.test(url)) ?? {
      urlPattern: /.*/,
      domains: ["Computer Vision"],
      extractDates: extractGenericDates,
    }
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keeps only the links worth surfacing on a challenge record: known hosting
 * platforms, datasets, leaderboards, rules, registration, github, workshop —
 * generic same-domain "other" navigation links are dropped as noise. */
function buildChallengeLinks(links: DiscoveredLink[]): { links: ScrapedChallengeLink[]; hostPlatform?: string } {
  const detected = detectPlatformLinks(links);
  const kept = detected.filter((d) => d.linkType !== "other");

  const seen = new Set<string>();
  const result: ScrapedChallengeLink[] = [];
  for (const d of kept) {
    if (seen.has(d.link.href)) continue;
    seen.add(d.link.href);
    result.push({
      label: d.hostPlatform ?? d.link.text ?? d.linkType,
      type: d.linkType,
      url: d.link.href,
    });
  }

  return { links: result, hostPlatform: kept.find((d) => d.hostPlatform)?.hostPlatform };
}

function extractDescription($: CheerioAPI): string | undefined {
  const description = $("p")
    .filter((_, el) => $(el).text().replace(/\s+/g, " ").trim().length > 120)
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  return description || undefined;
}

async function fetchOneChallenge(
  entry: WorkshopEntry,
  edition: SourceEditionCandidate,
): Promise<ScrapedChallenge | null> {
  const result = await fetchHtml(entry.url);
  if (!result.ok) return null;

  const $ = cheerio.load(result.html);
  const pageTitle = $("title").first().text().replace(/\s+/g, " ").trim();
  const name = entry.title || pageTitle || `CVPR ${edition.year} Challenge`;
  const shortName = pageTitle && pageTitle !== name && pageTitle.length < name.length ? pageTitle : undefined;

  const known = lookupKnownChallenge(result.url);
  const dateFields = known.extractDates($, edition.year);

  const allLinks = extractAllLinks($, result.url);
  const { links, hostPlatform } = buildChallengeLinks(allLinks);

  return {
    externalKey: `cvpr-${edition.year}-${slugify(entry.title || getRegistrableDomain(result.url))}`,
    name,
    shortName,
    description: extractDescription($),
    venueSlug: "cvpr",
    venueYear: edition.year,
    officialUrl: normalizeUrl(result.url),
    sourceUrl: normalizeUrl(edition.url),
    links,
    hostPlatform,
    domains: known.domains,
    ...dateFields,
  };
}

export const cvprAdapter: ChallengeSourceAdapter = {
  sourceId: "cvpr",
  venueSlug: "cvpr",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    return discoverPredictableEditions(context.now, {
      buildUrl: workshopsUrl,
      yearsBack: 1,
      yearsForward: 1,
      validate: (html) => /elc-project-link/i.test(html),
    });
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const result = await fetchHtml(edition.url);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);
    const workshops = extractChallengeWorkshops($, edition.url);

    const challenges: ScrapedChallenge[] = [];
    for (const entry of workshops) {
      const challenge = await fetchOneChallenge(entry, edition);
      if (challenge) challenges.push(challenge);
    }
    return challenges;
  },
};
