import { logger } from "@/lib/logger";
import { waitForRateLimit } from "@/lib/scraping/rateLimiter";

const log = logger.child({ component: "fetchRenderedHtml" });

/**
 * Section 12.4 — Playwright fallback. Only used when an adapter explicitly
 * opts in (e.g. the page requires client-side rendering to expose challenge
 * content). Never used as the default fetch path.
 */
export async function fetchRenderedHtml(url: string): Promise<{ ok: boolean; html: string }> {
  if (process.env.PLAYWRIGHT_ENABLED !== "true") {
    log.warn("playwright disabled via PLAYWRIGHT_ENABLED", { url });
    return { ok: false, html: "" };
  }

  await waitForRateLimit(url);

  try {
    // Lazy import so `playwright` (and its browser binaries) are only
    // required when an adapter actually needs rendered HTML.
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent: "AcademicChallengeTracker/1.0 (+https://github.com/academic-ai-challenge-tracker)",
      });
      await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
      const html = await page.content();
      return { ok: true, html };
    } finally {
      await browser.close();
    }
  } catch (error) {
    log.error("playwright render failed", { url, error: String(error) });
    return { ok: false, html: "" };
  }
}
