import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks } from "@/lib/scraping/extractLinks";
import { extractLabeledDatesFromLines, type LabeledDateText } from "@/lib/scraping/extractImportantDates";
import { classifyMilestoneLabel } from "@/lib/scraping/classifyMilestone";
import { detectPlatformLinks } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import type { ParsedDate } from "@/lib/dates/parsedDate";
import type { ChallengeSourceAdapter, ScrapedChallenge, ScrapedChallengeLink, SourceEditionCandidate } from "@/scrapers/types";

/**
 * KDD Cup.
 *
 * Discovery strategy: manual mapping (Section 11.5), same rationale as
 * wsdm.ts. Unlike WSDM (one task per year), a KDD Cup edition is frequently
 * several independently-sponsored tracks run on different platforms picked
 * by each sponsor (verified live: KDD Cup 2024 ran three unrelated tracks —
 * Amazon's Multi-Task Shopping challenge and Meta's CRAG-MM on AIcrowd, plus
 * Tsinghua's OAG-Challenge on Biendata; KDD Cup 2026 runs Tencent's UNI-REC
 * Challenge and HKUST's Data Agents Challenge on two unrelated bespoke
 * domains). There is no predictable per-year URL pattern at all, so we keep
 * a hand-curated map of each year's canonical "edition page":
 *
 *  - In a multi-track year, the edition page is that year's kdd.org
 *    conference site, which lists every track under its "KDD Cup" nav menu
 *    (confirmed live on kdd.org/kdd2024 and kdd2026.kdd.org). We parse that
 *    menu to discover each track's name + official link.
 *  - In a single-track year (e.g. 2025's sole "Meta CRAG-MM Challenge"), the
 *    conference site's "KDD Cup" nav item points straight at the track's own
 *    page, so we map directly to that page and treat the whole page as one
 *    challenge (its "Timeline" section carries real dates).
 */
const KNOWN_EDITIONS: Record<number, string> = {
  2025: "https://www.aicrowd.com/challenges/meta-crag-mm-challenge-2025",
  2026: "https://kdd2026.kdd.org/",
};

type KddDateField =
  | "registrationStart"
  | "registrationDeadline"
  | "challengeStart"
  | "challengeEnd"
  | "submissionDeadline"
  | "evaluationStart"
  | "evaluationEnd"
  | "workshopDate";

/**
 * Bespoke label -> field mapping for KDD Cup sites (Section 14 / classifyMilestone.ts
 * doc comment: adapters should special-case a site's exact wording when the
 * generic keyword rules don't fit). The Meta CRAG-MM "Timeline" section uses
 * phase/round wording ("Phase 1 Submission End Date", "Registration and Team
 * Freeze Deadline", "Winner Public Announcement") that classifyMilestone's
 * generic RULES don't recognize, so we try these first and fall back to
 * classifyMilestoneLabel for anything else.
 */
const KDD_LABEL_RULES: { field: KddDateField; keywords: RegExp }[] = [
  { field: "workshopDate", keywords: /winner public announcement|kdd cup winners? event|award ceremony/i },
  { field: "evaluationEnd", keywords: /phase 2 end|final leaderboard|competition end/i },
  { field: "evaluationStart", keywords: /phase 2 start/i },
  { field: "submissionDeadline", keywords: /submission end date|final submission/i },
  { field: "registrationDeadline", keywords: /registration.*(deadline|freeze)/i },
  { field: "registrationStart", keywords: /registration begin|registration open/i },
  { field: "challengeStart", keywords: /data available|dataset(s)? available|website open|warm-?up round start/i },
];

function classifyKddMilestoneLabel(label: string): KddDateField | null {
  for (const rule of KDD_LABEL_RULES) {
    if (rule.keywords.test(label)) return rule.field;
  }
  return classifyMilestoneLabel(label) as KddDateField | null;
}

function buildKddDateFields(rows: LabeledDateText[]): Partial<Record<KddDateField, ParsedDate>> {
  const result: Partial<Record<KddDateField, ParsedDate>> = {};
  for (const row of rows) {
    const field = classifyKddMilestoneLabel(row.label);
    if (!field || result[field]) continue;
    const parsed = parseHumanDate(row.dateText);
    if (parsed.value) {
      result[field] = parsed;
    }
  }
  return result;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type DiscoveredTrack = { name: string; url: string };

/**
 * Finds the "KDD Cup" nav menu item and, if it has a dropdown, returns the
 * distinct (name, url) pairs of every track listed under it — this is the
 * real DOM shape used by kdd.org's WordPress theme for both the classic
 * "sub-menu" (kdd.org/kddYYYY) and mega-menu (kddYYYY.kdd.org) nav variants.
 * The same menu is typically rendered twice (desktop + mobile), so results
 * are de-duplicated by URL. Returns an empty array when the "KDD Cup" nav
 * item is a single direct link with no dropdown (single-track years).
 */
function discoverTracksFromNav($: CheerioAPI, baseUrl: string): DiscoveredTrack[] {
  const seen = new Set<string>();
  const tracks: DiscoveredTrack[] = [];

  $("a").each((_, el) => {
    const anchor = $(el);
    const label = anchor.text().trim();
    if (!/^kdd cup$/i.test(label)) return;

    const parentLi = anchor.closest("li");
    const submenu = parentLi.find("> ul.sub-menu, > ul.mega-sub-menu").first();
    if (!submenu.length) return;

    submenu.find("> li > a[href]").each((__, trackEl) => {
      const trackAnchor = $(trackEl);
      const href = trackAnchor.attr("href");
      const name = trackAnchor.text().trim();
      if (!href || !name) return;
      const url = normalizeUrl(href, baseUrl);
      if (seen.has(url)) return;
      seen.add(url);
      tracks.push({ name, url });
    });
  });

  return tracks;
}

function buildTrackLinks($: CheerioAPI, pageUrl: string): ScrapedChallengeLink[] {
  const allLinks = extractAllLinks($, pageUrl);
  const detected = detectPlatformLinks(allLinks);
  const links: ScrapedChallengeLink[] = [];
  const seen = new Set<string>();
  for (const { link, linkType, hostPlatform } of detected) {
    if (linkType === "other" && !hostPlatform) continue;
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    links.push({ label: link.text || hostPlatform || linkType, type: linkType, url: link.href });
  }
  return links;
}

export const kddCupAdapter: ChallengeSourceAdapter = {
  sourceId: "kdd",
  venueSlug: "kdd",

  async discoverEditions(): Promise<SourceEditionCandidate[]> {
    return Object.entries(KNOWN_EDITIONS).map(([yearStr, url]) => ({ year: Number(yearStr), url }));
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const result = await fetchHtml(edition.url);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);
    const tracks = discoverTracksFromNav($, edition.url);

    // Multi-track year: the edition page is a conference nav hub listing
    // each independently-run track. We only have each track's name + own
    // (usually third-party) URL from the hub itself — no invented dates.
    if (tracks.length > 0) {
      return tracks.map((track) => ({
        externalKey: `kdd-${edition.year}-${slugify(track.name)}`,
        name: `KDD Cup ${edition.year}: ${track.name}`,
        venueSlug: "kdd",
        venueYear: edition.year,
        officialUrl: track.url,
        sourceUrl: normalizeUrl(edition.url),
        domains: ["Data Mining"],
        links: [],
      }));
    }

    // Single-track year: the edition page IS the track's own page.
    const rawTitle = $("title").first().text().trim();
    const cleanTitle = rawTitle
      .replace(/^AIcrowd\s*\|\s*/i, "")
      .replace(/\s*\|\s*Challenges\s*$/i, "")
      .trim();
    const name = cleanTitle ? `KDD Cup ${edition.year}: ${cleanTitle}` : `KDD Cup ${edition.year}`;

    const datesHeading = $("h1, h2, h3, h4").filter((_, el) => /important dates|timeline/i.test($(el).text()));
    // Scope to content between the "Timeline"/"Important Dates" heading and
    // the next same-or-higher-level heading, so subsections (e.g. this
    // site's "Phase 2: ..." <h3>) are included rather than cutting off after
    // the first <ul>.
    const labeledDates = extractLabeledDatesFromLines($, datesHeading.length ? datesHeading.first().nextUntil("h1, h2") : undefined);
    const dateFields = buildKddDateFields(labeledDates.length ? labeledDates : extractLabeledDatesFromLines($));

    const description = $("p")
      .filter((_, el) => $(el).text().replace(/\s+/g, " ").trim().length > 120)
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const links = buildTrackLinks($, edition.url);

    const challenge: ScrapedChallenge = {
      externalKey: `kdd-${edition.year}-${slugify(cleanTitle || "cup")}`,
      name,
      venueSlug: "kdd",
      venueYear: edition.year,
      officialUrl: normalizeUrl(edition.url),
      sourceUrl: normalizeUrl(edition.url),
      description: description || undefined,
      domains: ["Data Mining", "Multimodal", "Information Retrieval"],
      links,
      ...dateFields,
    };

    return [challenge];
  },
};
