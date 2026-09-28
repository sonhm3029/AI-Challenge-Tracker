import { fetchHtml } from "@/lib/scraping/fetchHtml";
import type { SourceEditionCandidate } from "@/scrapers/types";

export type PredictableEditionOptions = {
  /** Given a year, build the candidate edition URL. */
  buildUrl: (year: number) => string;
  /** How far back/forward from the current year to probe. Defaults to
   * Section 11.1's "current year - 1 .. current year + 2". */
  yearsBack?: number;
  yearsForward?: number;
  /** Optional extra validation beyond "HTTP 200" — e.g. confirm the page
   * actually mentions the challenge/venue name, not a generic 404 that the
   * server answered with a 200 status. */
  validate?: (html: string) => boolean;
};

/**
 * Section 11.1 — Predictable URLs discovery strategy. Probes a small
 * year window and keeps only editions that return valid content, so a
 * conference announcing next year's edition is picked up automatically
 * without any manual registry change.
 */
export async function discoverPredictableEditions(
  now: Date,
  options: PredictableEditionOptions,
): Promise<SourceEditionCandidate[]> {
  const { buildUrl, yearsBack = 1, yearsForward = 2, validate } = options;
  const currentYear = now.getUTCFullYear();
  const candidates: SourceEditionCandidate[] = [];

  for (let year = currentYear - yearsBack; year <= currentYear + yearsForward; year += 1) {
    const url = buildUrl(year);
    const result = await fetchHtml(url);
    if (!result.ok) continue;
    if (validate && !validate(result.html)) continue;
    candidates.push({ year, url: result.url });
  }

  return candidates;
}
