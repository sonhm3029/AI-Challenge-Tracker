import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

export type LabeledDateText = {
  label: string;
  dateText: string;
};

/**
 * Most academic challenge / conference pages publish an "Important Dates"
 * section as either a <table> of (label, date) rows or a <dl>/<ul> of
 * "Label: Date" pairs. This is a shared parsing utility (like parseDates.ts
 * or extractLinks.ts) — every Priority A/B/C adapter still owns its own
 * discovery strategy and field mapping; this just avoids re-implementing
 * the same three DOM shapes in every adapter file.
 */
export function extractLabeledDatesFromTables($: CheerioAPI, root?: Cheerio<AnyNode>): LabeledDateText[] {
  const scope = root ?? $("body");
  const results: LabeledDateText[] = [];

  scope.find("table").each((_, table) => {
    $(table)
      .find("tr")
      .each((__, row) => {
        const cells = $(row).find("th, td");
        if (cells.length < 2) return;
        const label = $(cells[0]).text().replace(/\s+/g, " ").trim();
        const dateText = $(cells[1]).text().replace(/\s+/g, " ").trim();
        if (label && dateText && /\d/.test(dateText)) {
          results.push({ label, dateText });
        }
      });
  });

  return results;
}

const MONTH_NAMES =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

// Matches a date expression anchored at the start of a string, e.g.
// "February 26, 2026", "26 February 2026", or "2026-02-26" — deliberately
// does NOT try to consume trailing prose after the date.
const LEADING_DATE_RE = new RegExp(
  `^\\s*(?:(?:${MONTH_NAMES})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES})\\.?,?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4})`,
  "i",
);

function extractLeadingDate(text: string): string | null {
  const match = text.match(LEADING_DATE_RE);
  return match ? match[0].trim() : null;
}

function firstSentence(text: string, maxLength = 160): string {
  const cut = text.search(/[.;]\s/);
  const truncated = cut > 10 ? text.slice(0, cut) : text;
  return truncated.length > maxLength ? `${truncated.slice(0, maxLength)}…` : truncated;
}

const SEPARATOR_RE = /[:–—]/;

/**
 * Parses "Label: Date" (or the reversed "Date: Label", seen on some sites
 * e.g. WSDM Cup's dated <li> list) out of <li>/<dt>/<dd>/<p> elements. Used
 * as a fallback when a page lists dates outside of a <table>. Trailing
 * prose after the date (common in these lists) is kept out of `dateText`
 * so downstream date parsing doesn't choke on it.
 */
export function extractLabeledDatesFromLines($: CheerioAPI, root?: Cheerio<AnyNode>): LabeledDateText[] {
  const scope = root ?? $("body");
  const results: LabeledDateText[] = [];

  scope.find("li, p, dt, dd").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || !/\d{4}/.test(text)) return;

    const sepMatch = text.match(SEPARATOR_RE);
    if (!sepMatch || sepMatch.index === undefined) return;

    const left = text.slice(0, sepMatch.index).trim();
    const right = text.slice(sepMatch.index + 1).trim();

    const leftDate = extractLeadingDate(left);
    const rightDate = extractLeadingDate(right);

    if (leftDate && !rightDate) {
      results.push({ label: firstSentence(right), dateText: leftDate });
    } else if (rightDate) {
      results.push({ label: firstSentence(left), dateText: rightDate });
    }
  });

  return results;
}

export function extractAllLabeledDates($: CheerioAPI, root?: Cheerio<AnyNode>): LabeledDateText[] {
  const fromTables = extractLabeledDatesFromTables($, root);
  if (fromTables.length > 0) return fromTables;
  return extractLabeledDatesFromLines($, root);
}
