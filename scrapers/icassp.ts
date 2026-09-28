import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { discoverPredictableEditions } from "@/lib/scraping/discoverPredictableEditions";
import { detectPlatformLinks, detectHostPlatform } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import type {
  ChallengeSourceAdapter,
  ScrapedChallenge,
  ScrapedChallengeLink,
  SourceEditionCandidate,
  CrawlContext,
} from "@/scrapers/types";

/**
 * ICASSP Signal Processing (SP) Grand Challenges.
 *
 * Discovery strategy: Section 11.1 Predictable URLs. Unlike WSDM Cup (a
 * different site with no naming convention at all per year), recent ICASSP
 * conference sites are standardized on a `{year}.ieeeicassp.org` domain with
 * a stable `/sp-grand-challenges/` path — confirmed live for 2024-2027
 * (2021-2023 predate this convention and 404 on the same path, so this is
 * not assumed to hold indefinitely into the past). We probe the standard
 * current-year -1..+2 window via discoverPredictableEditions and keep
 * whatever resolves with real grand-challenge content.
 *
 * Fetch strategy / parsing: the *URL* is predictable, but the *page markup*
 * is not — each year's site is individually rebuilt by that year's local
 * organizing committee, and the 2025 and 2026 editions (the two years we
 * have real fixtures for) use two entirely different WordPress page-builder
 * templates for the same kind of content:
 *   - 2026 ("evenz" template): one `<div class="evenz-vc-row-container"
 *     id="gc-N">` per challenge, containing an `<h4>` heading and a run of
 *     `<p><strong>Label</strong>: value</p>` rows ("Organized by",
 *     "Submission Link", "Challenge website", "Title", "Short description").
 *   - 2025 (older template): one `<div class="Grand-Challenges" id="gcN">`
 *     per challenge, with a `<p class="headline">`, an `<span
 *     class="org-by">`, an `<a class="btn">` for the challenge website, and
 *     a trailing plain `<p>` description.
 * Both parsers are tried in turn. A future year using a third template will
 * need its own parser added here — Section 11 explicitly allows this kind of
 * bespoke, site-specific handling when a source doesn't fit generic tooling.
 *
 * Neither the 2025 nor the 2026 listing page publishes per-challenge dates
 * (registration/submission/evaluation deadlines) — those live only on each
 * individual challenge's own external website (a different domain per
 * challenge, e.g. cadenzachallenge.org, rase-challenge.github.io, ...), which
 * is out of scope for this adapter's single fetch of the conference-level
 * listing page. So `ScrapedChallenge` date fields are intentionally left
 * undefined here rather than guessed at.
 *
 * The 2025 listing explicitly marks two of its nine challenges "- Cancelled"
 * in their heading; those are dropped rather than surfaced as live
 * challenges.
 */

const LISTING_PATH = "/sp-grand-challenges/";

function buildListingUrl(year: number): string {
  return `https://${year}.ieeeicassp.org${LISTING_PATH}`;
}

type ExtractedChallenge = {
  /** The source's own per-challenge id, e.g. "gc-1" (2026) or "gc1" (2025). */
  gcId: string;
  /** Heading text as shown in the listing, e.g. "GC-1: EEG Auditory Attention Decoding (EEG-AAD)". */
  heading: string;
  /** Explicit "Title:" field, when the source states a fuller/different title separately from the heading. */
  title?: string;
  websiteUrl?: string;
  submissionUrl?: string;
  description?: string;
};

const CANCELLED_RE = /\bcancell?ed\b/i;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Pulls a short acronym out of a trailing "(ACRONYM)" in a heading, if any. */
function extractParenthetical(heading: string): string | null {
  const match = heading.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : null;
}

function stripGcPrefix(heading: string): string {
  return heading.replace(/^GC-?\d+\s*[:.\-–—]\s*/i, "").trim();
}

/** Normalizes the source's own id ("gc-1", "gc1", "GC1") to a display label "GC-1". */
function normalizeGcLabel(gcId: string): string {
  const match = gcId.match(/gc-?(\d+)/i);
  return match ? `GC-${match[1]}` : gcId.toUpperCase();
}

/**
 * 2026-style template — see file header. Each `<p>` is a "Label: value" row
 * where the label lives in a leading `<strong>` (with the colon either
 * inside or outside the tag depending on the row).
 */
function parseEvenzTemplate($: CheerioAPI): ExtractedChallenge[] {
  const results: ExtractedChallenge[] = [];

  $('div.evenz-vc-row-container[id^="gc-"]').each((_, el) => {
    const block = $(el);
    const gcId = block.attr("id") ?? "";
    const heading = block.find("h4").first().text().replace(/\s+/g, " ").trim();
    if (!heading) return;

    let websiteUrl: string | undefined;
    let submissionUrl: string | undefined;
    let title: string | undefined;
    let description: string | undefined;

    block.find("p").each((__, p) => {
      const row = $(p);
      const label = row.find("strong").first().text().replace(/\s+/g, " ").trim().replace(/:$/, "");
      const text = row.text().replace(/\s+/g, " ").trim();
      const colonIndex = text.indexOf(":");
      const value = colonIndex >= 0 ? text.slice(colonIndex + 1).trim() : "";

      if (/^submission link$/i.test(label)) {
        submissionUrl = row.find("a").first().attr("href") ?? value;
      } else if (/^challenge website$/i.test(label)) {
        websiteUrl = row.find("a").first().attr("href") ?? value;
      } else if (/^title$/i.test(label)) {
        title = value;
      } else if (/^short description$/i.test(label)) {
        description = value;
      }
    });

    results.push({ gcId, heading, title, websiteUrl, submissionUrl, description });
  });

  return results;
}

/** 2025-style (legacy) template — see file header. */
function parseLegacyTemplate($: CheerioAPI): ExtractedChallenge[] {
  const results: ExtractedChallenge[] = [];

  $("div.Grand-Challenges").each((_, el) => {
    const block = $(el);
    const gcId = block.attr("id") ?? "";
    const heading = block.find("p.headline").first().text().replace(/\s+/g, " ").trim();
    if (!heading) return;

    const websiteUrl = block.find("a.btn").first().attr("href");
    const description = block
      .find("p")
      .filter((__, p) => !$(p).hasClass("headline"))
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    results.push({ gcId, heading, websiteUrl, description: description || undefined });
  });

  return results;
}

const DOMAIN_RULES: { domain: string; keywords: RegExp }[] = [
  { domain: "Speech", keywords: /\bspeech\b|\bspoken\b|\bdialogue\b|\btts\b|\bvoice\b/i },
  { domain: "Audio", keywords: /\baudio\b|acoustic|\bsound\b|\bmusic\b|\bhearing\b/i },
  { domain: "Multimodal", keywords: /multimodal|audio-visual|face-voice|\bvideo\b/i },
  { domain: "Medical AI", keywords: /\beeg\b|dementia|cognitive|neurodegenerative|\bmri\b|\bclinical\b|\bmedical\b/i },
];

/** Best-effort tagging into the seeded domain taxonomy — ICASSP SP Grand
 * Challenges are almost always Audio and/or Speech; a few additionally touch
 * Multimodal or Medical AI signal-processing tasks. Falls back to "Audio"
 * (this source's default) when no keyword matches. */
function classifyDomains(haystack: string): string[] {
  const found = new Set<string>();
  for (const rule of DOMAIN_RULES) {
    if (rule.keywords.test(haystack)) found.add(rule.domain);
  }
  if (found.size === 0) found.add("Audio");
  return Array.from(found);
}

export const icasspGrandChallengesAdapter: ChallengeSourceAdapter = {
  sourceId: "icassp",
  venueSlug: "icassp",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    return discoverPredictableEditions(context.now, {
      buildUrl: buildListingUrl,
      validate: (html) => /grand challenge/i.test(html),
    });
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const result = await fetchHtml(edition.url);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);

    let extracted = parseEvenzTemplate($);
    if (extracted.length === 0) extracted = parseLegacyTemplate($);

    const challenges: ScrapedChallenge[] = [];

    for (const item of extracted) {
      if (CANCELLED_RE.test(item.heading)) continue;

      const nameSource = item.title || stripGcPrefix(item.heading) || item.heading;
      const name = nameSource.replace(/\s+/g, " ").trim();

      const parenthetical = extractParenthetical(item.heading);
      const slugSource = parenthetical ?? stripGcPrefix(item.heading) ?? item.heading;
      const externalKey = `icassp-${edition.year}-${slugify(slugSource) || item.gcId}`;

      const anchorUrl = normalizeUrl(`${edition.url}#${item.gcId}`);
      const officialUrl = item.websiteUrl ? normalizeUrl(item.websiteUrl, edition.url) : anchorUrl;

      const links: ScrapedChallengeLink[] = [];
      if (item.websiteUrl) {
        const [detected] = detectPlatformLinks([{ text: "Challenge website", href: officialUrl }]);
        links.push({
          label: "Challenge website",
          type: detected.linkType === "other" ? "official" : detected.linkType,
          url: officialUrl,
        });
      }
      if (item.submissionUrl) {
        links.push({
          label: "Paper submission (ICASSP proceedings)",
          type: "other",
          url: normalizeUrl(item.submissionUrl, edition.url),
        });
      }

      const hostPlatform = detectHostPlatform(links.map((l) => ({ text: l.label, href: l.url })));

      challenges.push({
        externalKey,
        name,
        shortName: normalizeGcLabel(item.gcId),
        description: item.description,
        venueSlug: "icassp",
        venueYear: edition.year,
        officialUrl,
        sourceUrl: anchorUrl,
        links,
        hostPlatform,
        domains: classifyDomains(`${item.heading} ${item.title ?? ""} ${item.description ?? ""}`),
        rawPayload: item,
      });
    }

    return challenges;
  },
};
