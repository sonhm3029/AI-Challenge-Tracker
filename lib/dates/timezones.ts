/**
 * Maps informal timezone labels commonly seen on conference / challenge pages
 * to IANA zone names that luxon can resolve. AoE ("Anywhere on Earth") is the
 * classic example used by nearly every CS conference deadline.
 */
export const TIMEZONE_ALIASES: Record<string, string> = {
  aoe: "Etc/GMT+12",
  "anywhere on earth": "Etc/GMT+12",
  utc: "UTC",
  gmt: "UTC",
  z: "UTC",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  ct: "America/Chicago",
  mst: "America/Denver",
  mdt: "America/Denver",
  mt: "America/Denver",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  cet: "Europe/Paris",
  cest: "Europe/Paris",
  bst: "Europe/London",
  jst: "Asia/Tokyo",
  sgt: "Asia/Singapore",
  ist: "Asia/Kolkata",
};

export function resolveTimezoneAlias(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  if (TIMEZONE_ALIASES[key]) return TIMEZONE_ALIASES[key];
  // Already an IANA-looking zone (e.g. "America/New_York" or "Etc/GMT+12").
  if (/^[a-z]+\/[a-z_+-]+$/i.test(raw.trim()) || /^etc\/gmt/i.test(raw.trim())) {
    return raw.trim();
  }
  return undefined;
}
