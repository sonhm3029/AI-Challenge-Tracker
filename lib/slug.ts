/**
 * Section 52 — slugs must be stable and URL-safe. Slugify is only used when
 * *creating* a record; once a slug exists it must never be silently changed
 * by a re-crawl (see jobs/updateSource.ts / findExistingChallenge).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function buildChallengeSlug(name: string, venueYear?: number | null): string {
  const base = slugify(name);
  if (venueYear && !base.includes(String(venueYear))) {
    return `${base}-${venueYear}`;
  }
  return base;
}
