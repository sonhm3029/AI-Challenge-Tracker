import type { ScrapedChallenge } from "@/scrapers/types";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import type { ParsedDate } from "@/lib/dates/parsedDate";

/**
 * Section 13 — Parsing and Normalization. Cleans whitespace/Unicode on text
 * fields and normalizes every URL, without discarding the original raw
 * values the caller already tracks separately (rawPayload, originalText on
 * dates, timezoneOriginal, etc).
 */
export function normalizeWhitespace(input: string): string {
  return input.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(input: string): string {
  return normalizeWhitespace(input).replace(/\s*[|\-–—]\s*$/, "");
}

/** Lowercase, whitespace/punctuation-collapsed form used for dedupe matching only. */
export function normalizeNameForMatching(input: string): string {
  return normalizeWhitespace(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type NormalizedChallenge = ScrapedChallenge & {
  name: string;
  officialUrl: string;
  sourceUrl: string;
};

export function normalizeScrapedChallenge(input: ScrapedChallenge): NormalizedChallenge {
  return {
    ...input,
    name: normalizeTitle(input.name),
    shortName: input.shortName ? normalizeWhitespace(input.shortName) : undefined,
    description: input.description ? normalizeWhitespace(input.description) : undefined,
    officialUrl: normalizeUrl(input.officialUrl),
    sourceUrl: normalizeUrl(input.sourceUrl),
    links: input.links?.map((link) => ({
      ...link,
      label: normalizeWhitespace(link.label),
      url: normalizeUrl(link.url, input.officialUrl),
    })),
    domains: input.domains?.map((d) => normalizeWhitespace(d)),
    taskTags: input.taskTags?.map((t) => normalizeWhitespace(t)),
  };
}

export function parsedDateOrNull(date: ParsedDate | undefined): Date | null {
  return date?.value ?? null;
}
