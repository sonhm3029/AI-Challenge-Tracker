/**
 * Section 14 — Date Handling.
 *
 * A ParsedDate preserves the original source text and timezone alongside the
 * resolved instant so we never silently invent precision (e.g. a 23:59 that
 * the source never stated).
 */
export type DatePrecision = "date" | "minute" | "second";

export type ParsedDate = {
  value: Date | null;
  originalText: string;
  timezone?: string;
  precision: DatePrecision;
};

export function isParsedDate(value: unknown): value is ParsedDate {
  return (
    typeof value === "object" &&
    value !== null &&
    "originalText" in value &&
    "precision" in value
  );
}
