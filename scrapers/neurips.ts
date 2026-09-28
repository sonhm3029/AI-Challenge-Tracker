import * as cheerio from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks } from "@/lib/scraping/extractLinks";
import { extractLabeledDatesFromLines, type LabeledDateText } from "@/lib/scraping/extractImportantDates";
import { classifyMilestoneLabel, buildDateFieldsFromLabeledText } from "@/lib/scraping/classifyMilestone";
import { detectHostPlatform, detectPlatformLinks } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import type {
  ChallengeSourceAdapter,
  ScrapedChallenge,
  ScrapedChallengeLink,
  SourceEditionCandidate,
  CrawlContext,
} from "@/scrapers/types";

/**
 * NeurIPS Competition Track.
 *
 * "One page lists many challenges" — every year NeurIPS accepts a cohort of
 * ~15-20 independent competitions into its Competition Track, each with its
 * own external site (Codabench, EvalAI, Kaggle, GitHub Pages, a university
 * page, ...). This adapter emits one ScrapedChallenge per competition found
 * in that year's cohort.
 *
 * Discovery strategy — checked live against neurips.cc in Sept 2026:
 *
 *   - `https://neurips.cc/Conferences/{year}/CompetitionTrack` (a Section
 *     11.1-style predictable URL) is real, static, server-rendered HTML for
 *     2022/2023/2024 (each competition listed under a category heading with
 *     a link straight to its official site) — but returns HTTP 404 for
 *     2025 and 2026. NeurIPS retired that page once its "virtual site" app
 *     took over.
 *   - The virtual-site replacement, `https://neurips.cc/virtual/{year}/events/Competition`,
 *     lists competitions only as links to NeurIPS's *own* per-competition
 *     detail pages, which in turn only link to OpenReview — no official
 *     external site link is exposed anywhere in that app. It can't supply
 *     `officialUrl` at all, so it's a dead end for this adapter's purpose.
 *   - The NeurIPS Blog's yearly "NeurIPS {year} Competitions Announced" post
 *     has been published every year 2022-2026 with exactly the shape the
 *     old CompetitionTrack page had: competitions grouped under category
 *     headings (<p> immediately before a <ul>), each <li><a> linking to the
 *     competition's own official site. This is the richest available
 *     source, but the post's exact URL (publication month/day) isn't
 *     predictable year to year.
 *
 * So discovery is two-stage, combining Section 11.2 (stable archive page)
 * with 11.4 (search a page's links for a keyword): `blog.neurips.cc/category/{year}-conference/`
 * IS a stable, predictable per-year archive URL; we fetch it and pick out
 * the one post link whose slug contains "competit" (matches both
 * "neurips-2026-competitions-announced" and, e.g., 2023's differently
 * worded "announcing-the-neurips-2023-competitions").
 */
const CATEGORY_ARCHIVE_URL = (year: number) => `https://blog.neurips.cc/category/${year}-conference/`;

function findAnnouncementUrl(archiveHtml: string, year: number): string | null {
  const re = new RegExp(`href="(https://blog\\.neurips\\.cc/${year}/\\d{2}/\\d{2}/[^"]*competit[^"]*)"`, "i");
  const match = archiveHtml.match(re);
  return match ? match[1] : null;
}

// Best-effort keyword classification of a competition's category heading
// and title into the site's fixed domain list (Section 13). A competition
// commonly matches more than one (e.g. "Robotics, Agents, and Embodied AI").
const DOMAIN_RULES: { pattern: RegExp; domain: string }[] = [
  { pattern: /computer vision|\bvision\b|\bimage(s)?\b|\bvisual\b|\bface\b|watermark/i, domain: "Computer Vision" },
  { pattern: /\bnlp\b|natural language|\btext\b/i, domain: "NLP" },
  { pattern: /language model|\bllm(s)?\b|generative ai|\breasoning\b|foundation model/i, domain: "LLM" },
  { pattern: /multiagent|multi-agent|reinforcement learning|\bagents?\b|embodied/i, domain: "Agents" },
  { pattern: /retrieval|\bsearch\b/i, domain: "Information Retrieval" },
  { pattern: /recommend/i, domain: "Recommender Systems" },
  { pattern: /data mining/i, domain: "Data Mining" },
  { pattern: /\baudio\b|acoustic/i, domain: "Audio" },
  { pattern: /\bspeech\b|\basr\b/i, domain: "Speech" },
  { pattern: /multimodal|multi-modal/i, domain: "Multimodal" },
  { pattern: /health|medical|biology|clinical|patholog|drug|cancer|genom|humanitarian/i, domain: "Medical AI" },
  { pattern: /\brobot/i, domain: "Robotics" },
  {
    pattern: /physic|scientific|weather|climate|astro|cosmolog|fusion|polymer|chemistry|engineering|pde\b/i,
    domain: "Scientific ML",
  },
  { pattern: /optimi[sz]ation/i, domain: "Optimization" },
];

function inferDomains(category: string | undefined, title: string): string[] {
  const haystack = `${category ?? ""} ${title}`;
  const matched = DOMAIN_RULES.filter((rule) => rule.pattern.test(haystack)).map((rule) => rule.domain);
  const unique = Array.from(new Set(matched));
  return unique.length ? unique : ["General ML"];
}

function slugify(input: string): string {
  return (
    input
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "competition"
  );
}

// classifyMilestoneLabel (shared, Section 14) doesn't recognize every real
// wording we found in the wild across 16+ independently-run competition
// sites. Rather than editing the shared classifier, this adapter maps a
// small number of known-exact phrasings onto the wording it does recognize
// before handing rows to buildDateFieldsFromLabeledText — the same
// "special-case a site's exact wording when known" escape hatch that
// classifyMilestone.ts's own docstring calls out.
const LABEL_ALIASES: { pattern: RegExp; label: string }[] = [{ pattern: /^competition deadline$/i, label: "submission deadline" }];

function applyKnownLabelAliases(row: LabeledDateText): LabeledDateText {
  if (classifyMilestoneLabel(row.label)) return row;
  const alias = LABEL_ALIASES.find((a) => a.pattern.test(row.label.trim()));
  return alias ? { ...row, label: alias.label } : row;
}

type ListedCompetition = { category: string | undefined; title: string; url: string | null };

/**
 * Parses the blog announcement post's DOM: a flat run of <p>/<ul> siblings
 * inside `.entry-content`, where a short <p> not ending in "." or ":"
 * immediately preceding a <ul> is that <ul>'s category heading, and each
 * <li><a> in the <ul> is one accepted competition.
 */
function parseAnnouncementPost($: cheerio.CheerioAPI, baseUrl: string): ListedCompetition[] {
  const scope = $(".entry-content").first();
  const listed: ListedCompetition[] = [];
  let currentCategory: string | undefined;

  scope.children().each((_, el) => {
    const $el = $(el);
    if (el.tagName === "p") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text && text.length < 90 && !/[.:]$/.test(text)) {
        currentCategory = text;
      }
      return;
    }
    if (el.tagName === "ul") {
      $el.find("li").each((__, li) => {
        const $li = $(li);
        const a = $li.find("a").first();
        const title = (a.length ? a.text() : $li.text()).replace(/\s+/g, " ").trim();
        if (!title) return;
        const href = a.attr("href");
        listed.push({
          category: currentCategory,
          title,
          url: href ? normalizeUrl(href, baseUrl) : null,
        });
      });
    }
  });

  return listed;
}

export const neuripsCompetitionsAdapter: ChallengeSourceAdapter = {
  sourceId: "neurips",
  venueSlug: "neurips",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    const currentYear = context.now.getUTCFullYear();
    const editions: SourceEditionCandidate[] = [];

    for (let year = currentYear - 1; year <= currentYear + 1; year += 1) {
      const archiveResult = await fetchHtml(CATEGORY_ARCHIVE_URL(year));
      if (!archiveResult.ok) continue;

      const announcementUrl = findAnnouncementUrl(archiveResult.html, year);
      if (!announcementUrl) continue;

      editions.push({ year, url: announcementUrl });
    }

    return editions;
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const listingResult = await fetchHtml(edition.url);
    if (!listingResult.ok) return [];

    const $ = cheerio.load(listingResult.html);
    const listed = parseAnnouncementPost($, edition.url);

    const challenges: ScrapedChallenge[] = [];

    for (const item of listed) {
      // A handful of announced competitions don't have a dedicated site yet
      // at announcement time (e.g. "DCVLR" in the 2025 cohort) — we never
      // fabricate a URL, so those are skipped rather than guessed at.
      if (!item.url) continue;
      const officialUrl = item.url;

      const domains = inferDomains(item.category, item.title);
      let description: string | undefined;
      let dateFields: Partial<ScrapedChallenge> = {};
      let links: ScrapedChallengeLink[] = [];
      let hostPlatform = detectHostPlatform([{ text: "", href: officialUrl }]);

      // Best-effort second fetch of the competition's own official page for
      // richer dates/links/description. Most third-party sites don't share
      // any DOM shape with each other, so this frequently comes back empty
      // — that's expected, not an error; the challenge is still returned
      // with just a name + official link (status "unknown" downstream).
      const detail = await fetchHtml(officialUrl);
      if (detail.ok) {
        const $detail = cheerio.load(detail.html);

        description =
          $detail('meta[name="description"]').attr("content")?.trim() ||
          $detail("p")
            .filter((_, p) => $detail(p).text().trim().length > 120)
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim() ||
          undefined;

        const labeledDates = extractLabeledDatesFromLines($detail).map(applyKnownLabelAliases);
        dateFields = buildDateFieldsFromLabeledText(labeledDates);

        const discoveredLinks = extractAllLinks($detail, officialUrl);
        hostPlatform = detectHostPlatform([{ text: "", href: officialUrl }, ...discoveredLinks]) ?? hostPlatform;

        links = detectPlatformLinks(discoveredLinks)
          .filter((d) => ["dataset", "leaderboard", "registration", "github", "platform"].includes(d.linkType))
          .filter((d) => normalizeUrl(d.link.href) !== normalizeUrl(officialUrl))
          .slice(0, 5)
          .map((d) => ({ label: d.link.text || d.linkType, type: d.linkType, url: d.link.href }));
      }

      challenges.push({
        externalKey: `neurips-${edition.year}-${slugify(item.title)}`,
        name: item.title,
        venueSlug: "neurips",
        venueYear: edition.year,
        officialUrl: normalizeUrl(officialUrl),
        sourceUrl: normalizeUrl(edition.url),
        description,
        domains,
        hostPlatform,
        links,
        ...dateFields,
      });
    }

    return challenges;
  },
};
