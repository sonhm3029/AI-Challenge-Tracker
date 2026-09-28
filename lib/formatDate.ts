const FORMATTER = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" });
const FORMATTER_WITH_TIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatAbsoluteDate(date: Date | null | undefined): string {
  if (!date) return "TBD";
  return FORMATTER.format(date);
}

export function formatAbsoluteDateTime(date: Date | null | undefined): string {
  if (!date) return "TBD";
  return FORMATTER_WITH_TIME.format(date);
}
