import type { ScrapedChallenge } from "@/scrapers/types";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import type { LabeledDateText } from "@/lib/scraping/extractImportantDates";

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

/**
 * Best-effort keyword classification of an "Important Dates" row label into
 * one of the challenge's structured date fields. Ambiguous or unrecognized
 * labels are dropped rather than guessed at (Section 14 correctness) —
 * adapters should still special-case a site's exact wording when known.
 */
const RULES: { field: DateField; keywords: RegExp }[] = [
  { field: "workshopDate", keywords: /workshop|presentation day|cup session|session at .*conference/i },
  { field: "evaluationEnd", keywords: /evaluation (ends|closes|deadline)|final leaderboard|winners? announced/i },
  { field: "evaluationStart", keywords: /evaluation (begins|starts|opens)/i },
  { field: "submissionDeadline", keywords: /submission (deadline|closes|due)|code upload deadline|final submission/i },
  { field: "registrationDeadline", keywords: /registration (deadline|closes|due|ends)/i },
  { field: "registrationStart", keywords: /registration (opens|begins|starts)/i },
  { field: "challengeEnd", keywords: /challenge (ends|closes)|competition (ends|closes)/i },
  {
    field: "challengeStart",
    keywords: /challenge (begins|starts|opens)|competition (begins|starts|opens)|dataset(s)? (released|available)|data (release|collection)|submission portal (is|are) available/i,
  },
];

export function classifyMilestoneLabel(label: string): DateField | null {
  for (const rule of RULES) {
    if (rule.keywords.test(label)) return rule.field;
  }
  return null;
}

/**
 * Applies classifyMilestoneLabel + parseHumanDate over a set of extracted
 * (label, date-text) rows, writing the first match found for each field
 * onto a partial ScrapedChallenge date bag.
 */
export function buildDateFieldsFromLabeledText(
  rows: LabeledDateText[],
): Partial<Record<DateField, ReturnType<typeof parseHumanDate>>> {
  const result: Partial<Record<DateField, ReturnType<typeof parseHumanDate>>> = {};
  for (const row of rows) {
    const field = classifyMilestoneLabel(row.label);
    if (!field || result[field]) continue;
    const parsed = parseHumanDate(row.dateText);
    if (parsed.value) {
      result[field] = parsed;
    }
  }
  return result;
}
