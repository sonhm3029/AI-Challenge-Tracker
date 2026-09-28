import { logger } from "@/lib/logger";
import { waitForRateLimit } from "@/lib/scraping/rateLimiter";

const USER_AGENT = "AcademicChallengeTracker/1.0 (+https://github.com/academic-ai-challenge-tracker)";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const BACKOFF_MS = [2000, 5000];

export type FetchHtmlResult = {
  ok: boolean;
  status: number;
  url: string;
  html: string;
};

export type FetchHtmlOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
};

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      /ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(error.message)
    );
  }
  return false;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with a per-domain rate limit, timeout, and bounded retry
 * with backoff for transient failures only (Section 12.1 / 12.2). 4xx errors
 * other than 408/429 are not retried.
 */
export async function fetchHtml(url: string, options: FetchHtmlOptions = {}): Promise<FetchHtmlResult> {
  const { timeoutMs = 15000, maxRetries = BACKOFF_MS.length, headers = {} } = options;
  const log = logger.child({ component: "fetchHtml", url });

  let attempt = 0;
  // attempt indices: 0 = first try, 1..maxRetries = retries
  for (;;) {
    await waitForRateLimit(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Encoding": "gzip, br",
          ...headers,
        },
      });
      clearTimeout(timeout);

      if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        log.warn("retryable HTTP status", { status: response.status, attempt });
        await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
        attempt += 1;
        continue;
      }

      const html = response.ok ? await response.text() : "";
      return { ok: response.ok, status: response.status, url: response.url || url, html };
    } catch (error) {
      clearTimeout(timeout);
      if (isRetryableError(error) && attempt < maxRetries) {
        log.warn("retryable fetch error", { error: String(error), attempt });
        await sleep(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
        attempt += 1;
        continue;
      }
      log.error("fetch failed", { error: String(error) });
      return { ok: false, status: 0, url, html: "" };
    }
  }
}
