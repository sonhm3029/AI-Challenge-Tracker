import * as cheerio from "cheerio";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks } from "@/lib/scraping/extractLinks";
import { extractLabeledDatesFromLines } from "@/lib/scraping/extractImportantDates";
import { buildDateFieldsFromLabeledText } from "@/lib/scraping/classifyMilestone";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import type { ChallengeSourceAdapter, ScrapedChallenge, SourceEditionCandidate, CrawlContext } from "@/scrapers/types";

/**
 * WSDM Cup.
 *
 * Discovery strategy: manual mapping (Section 11.5). Each year's WSDM Cup
 * task gets a *different* dedicated website chosen by that year's winning
 * proposal (e.g. wsdmcup-2026.github.io for the 2026 "Multilingual
 * Retrieval" task) — there is no single stable predictable URL. We keep a
 * known-editions map here and additionally probe the same
 * `wsdmcup-{year}.github.io` naming convention for newer years in case a
 * future edition happens to reuse it, but the map is the source of truth.
 */
const KNOWN_EDITIONS: Record<number, string> = {
  2026: "https://wsdmcup-2026.github.io/",
};

export const wsdmCupAdapter: ChallengeSourceAdapter = {
  sourceId: "wsdm",
  venueSlug: "wsdm",

  async discoverEditions(context: CrawlContext): Promise<SourceEditionCandidate[]> {
    const editions: SourceEditionCandidate[] = [];
    const currentYear = context.now.getUTCFullYear();

    for (const [yearStr, url] of Object.entries(KNOWN_EDITIONS)) {
      editions.push({ year: Number(yearStr), url });
    }

    // Supplement with the same naming convention for years just ahead of
    // the known map, in case a future edition reuses the pattern.
    for (let year = currentYear; year <= currentYear + 1; year += 1) {
      if (KNOWN_EDITIONS[year]) continue;
      const url = `https://wsdmcup-${year}.github.io/`;
      const result = await fetchHtml(url);
      if (result.ok && /wsdm cup/i.test(result.html)) {
        editions.push({ year, url });
      }
    }

    return editions;
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const result = await fetchHtml(edition.url);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);
    const pageTitle = $("title").first().text().trim();
    const taskTitle = $(".intro-heading").first().text().trim();
    const name = taskTitle && !pageTitle.includes(taskTitle) ? `${pageTitle}: ${taskTitle}` : pageTitle || `WSDM Cup ${edition.year}`;

    const datesHeading = $('[id="important-dates"], h1, h2, h3, h4').filter((_, el) =>
      /important dates/i.test($(el).text()),
    );
    const datesList = datesHeading.first().nextAll("ul").first();
    const labeledDates = extractLabeledDatesFromLines($, datesList.length ? datesList : undefined);
    const dateFields = buildDateFieldsFromLabeledText(labeledDates);

    const allLinks = extractAllLinks($, edition.url);
    const githubLink = allLinks.find((l) => /github\.com\/wsdmcup/i.test(l.href));

    const description = $("p")
      .filter((_, el) => $(el).text().length > 120)
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const challenge: ScrapedChallenge = {
      externalKey: `wsdm-${edition.year}`,
      name,
      venueSlug: "wsdm",
      venueYear: edition.year,
      officialUrl: normalizeUrl(edition.url),
      sourceUrl: normalizeUrl(edition.url),
      description: description || undefined,
      domains: ["Information Retrieval"],
      links: githubLink
        ? [
            {
              label: "GitHub",
              type: "github",
              url: githubLink.href.replace(/\/issues\/?$/, ""),
            },
          ]
        : [],
      ...dateFields,
    };

    return [challenge];
  },
};
