import type { CheerioAPI } from "cheerio";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";

export type DiscoveredLink = {
  text: string;
  href: string;
};

/**
 * Extracts all anchor links from a page, resolved against `baseUrl`.
 * Section 11.4 — conference navigation discovery relies on filtering these
 * by keyword; kept generic here so every adapter can reuse it.
 */
export function extractAllLinks($: CheerioAPI, baseUrl: string): DiscoveredLink[] {
  const links: DiscoveredLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("mailto:") || href.startsWith("javascript:")) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    links.push({ text, href: normalizeUrl(href, baseUrl) });
  });
  return links;
}

const CHALLENGE_KEYWORDS = [
  "challenge",
  "competition",
  "cup",
  "shared task",
  "grand challenge",
  "benchmark",
  "contest",
];

/**
 * Section 11.4 — filters links to those whose visible text or URL path look
 * like a challenge/competition page. Still source-local: only ever applied
 * to links already extracted from a known official site.
 */
export function filterChallengeLikeLinks(links: DiscoveredLink[]): DiscoveredLink[] {
  return links.filter((link) => {
    const haystack = `${link.text} ${link.href}`.toLowerCase();
    return CHALLENGE_KEYWORDS.some((keyword) => haystack.includes(keyword));
  });
}
