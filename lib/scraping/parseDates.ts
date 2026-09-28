import { DateTime } from "luxon";
import type { ParsedDate } from "@/lib/dates/parsedDate";
import { resolveTimezoneAlias } from "@/lib/dates/timezones";

const TRAILING_TZ_RE = new RegExp(
  `\\b(AoE|Anywhere on Earth|UTC|GMT|Z|EST|EDT|ET|CST|CDT|CT|MST|MDT|MT|PST|PDT|PT|CET|CEST|BST|JST|SGT|IST)\\b\\.?\\s*$`,
  "i",
);

/**
 * Extracts a trailing timezone label (e.g. "Feb 5, 2027, 23:59 AoE") and
 * returns the remaining date text plus the resolved IANA zone, if any.
 */
function splitTrailingTimezone(text: string): { rest: string; timezone?: string; originalTimezone?: string } {
  const match = text.match(TRAILING_TZ_RE);
  if (!match) return { rest: text.trim() };
  const label = match[1];
  const rest = text.slice(0, match.index).trim().replace(/,\s*$/, "");
  return { rest, timezone: resolveTimezoneAlias(label), originalTimezone: label };
}

function hasTimeComponent(text: string): boolean {
  return /\d{1,2}:\d{2}(:\d{2})?/.test(text);
}

function hasSecondsComponent(text: string): boolean {
  return /\d{1,2}:\d{2}:\d{2}/.test(text);
}

const FORMATS_WITH_TIME = [
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "MMMM d, yyyy, HH:mm",
  "MMMM d, yyyy HH:mm",
  "MMM d, yyyy, HH:mm",
  "MMM d, yyyy HH:mm",
  "d MMMM yyyy HH:mm",
  "d MMM yyyy HH:mm",
];

const FORMATS_DATE_ONLY = [
  "yyyy-MM-dd",
  "MMMM d, yyyy",
  "MMM d, yyyy",
  "MMMM d yyyy",
  "d MMMM yyyy",
  "d MMM yyyy",
  "MMMM yyyy",
];

/**
 * Parses a natural-language or ISO date string commonly found on academic
 * challenge / conference pages. Never invents a time-of-day the source did
 * not state (Section 14): a date-only source stays `precision: "date"` and
 * resolves to local midnight in the given zone rather than 23:59.
 */
export function parseHumanDate(input: string | null | undefined): ParsedDate {
  const originalText = (input ?? "").trim();
  if (!originalText) {
    return { value: null, originalText, precision: "date" };
  }

  const { rest, timezone, originalTimezone } = splitTrailingTimezone(originalText);
  const zone = timezone ?? "UTC";
  const candidate = rest.replace(/(\d)(st|nd|rd|th)\b/gi, "$1").trim();

  const withTime = hasTimeComponent(candidate);
  const formats = withTime ? FORMATS_WITH_TIME : FORMATS_DATE_ONLY;

  for (const format of formats) {
    const dt = DateTime.fromFormat(candidate, format, { zone });
    if (dt.isValid) {
      return {
        value: dt.toJSDate(),
        originalText,
        timezone: originalTimezone ?? (timezone ? timezone : undefined),
        precision: withTime ? (hasSecondsComponent(candidate) ? "second" : "minute") : "date",
      };
    }
  }

  // ISO 8601 (with or without offset/time) as a fallback.
  const iso = DateTime.fromISO(candidate, { zone });
  if (iso.isValid) {
    return {
      value: iso.toJSDate(),
      originalText,
      timezone: originalTimezone ?? timezone,
      precision: withTime ? (hasSecondsComponent(candidate) ? "second" : "minute") : "date",
    };
  }

  // Last resort: let the JS Date constructor try (handles many RFC 2822-ish
  // strings). Still validated before being trusted.
  const native = new Date(candidate);
  if (!Number.isNaN(native.getTime())) {
    return {
      value: native,
      originalText,
      timezone: originalTimezone ?? timezone,
      precision: withTime ? (hasSecondsComponent(candidate) ? "second" : "minute") : "date",
    };
  }

  return { value: null, originalText, timezone: originalTimezone, precision: "date" };
}

export function formatParsedDate(parsed: ParsedDate): string {
  if (!parsed.value) return "Unknown";
  return DateTime.fromJSDate(parsed.value).toUTC().toFormat("yyyy-MM-dd");
}
