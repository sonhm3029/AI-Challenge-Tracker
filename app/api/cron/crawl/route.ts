import { NextResponse, type NextRequest } from "next/server";
import { updateAllSources } from "@/jobs/updateAllSources";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "api/cron/crawl" });

export const maxDuration = 300;

/**
 * Section 38 — "Cron endpoint": an HTTP-triggerable alternative to the
 * GitHub Actions scheduled workflow (Section 7 recommends GitHub Actions as
 * primary; this exists for platforms — e.g. Vercel Cron — that only offer
 * HTTP-based scheduling, and for ad-hoc manual triggers). Never exposed
 * without the bearer secret.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await updateAllSources();
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("cron-triggered crawl failed", { error: String(error) });
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
