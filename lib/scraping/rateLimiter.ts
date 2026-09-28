/**
 * Section 12.3 — per-domain rate limiting. Default: 1 request/second/domain.
 * A single in-process limiter is sufficient at our scale (Section 58) since
 * the crawler runs as one job, not a distributed fleet.
 */
const lastRequestAtByDomain = new Map<string, number>();
const DEFAULT_MIN_INTERVAL_MS = 1000;
const domainOverridesMs = new Map<string, number>();

export function setDomainRateLimit(domain: string, minIntervalMs: number) {
  domainOverridesMs.set(domain, minIntervalMs);
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits, if necessary, until it is safe to issue another request to the
 * domain in `url`, then records the request time.
 */
export async function waitForRateLimit(url: string): Promise<void> {
  const domain = extractDomain(url);
  const minInterval = domainOverridesMs.get(domain) ?? DEFAULT_MIN_INTERVAL_MS;
  const last = lastRequestAtByDomain.get(domain) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < minInterval) {
    await sleep(minInterval - elapsed);
  }
  lastRequestAtByDomain.set(domain, Date.now());
}
