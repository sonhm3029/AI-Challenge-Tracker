import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { crawlRuns, sourceSeries, type CrawlRunStatus } from "@/db/schema";
import { getAdapter } from "@/scrapers/registry";
import { detectAnomaly, getPreviousSuccessfulRunRecordCount, runSourceEditions, type SourceSeriesRow } from "@/jobs/updateSource";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "updateAllSources" });

/**
 * Section 20/21 — runs one source end to end, isolated so a broken adapter
 * or a dead upstream site can never interrupt the other sources in the same
 * daily job (Section 20: "One source failing must not interrupt others").
 */
export async function runSourceSafely(source: SourceSeriesRow): Promise<void> {
  const runLog = log.child({ source: source.slug });
  const [run] = await db
    .insert(crawlRuns)
    .values({ sourceSeriesId: source.id, status: "running" })
    .returning({ id: crawlRuns.id });

  const now = new Date();
  let status: CrawlRunStatus = "success";
  let errorSummary: string | undefined;

  try {
    const adapter = getAdapter(source.adapterName);
    const previousCount = await getPreviousSuccessfulRunRecordCount(source.id);
    const summary = await runSourceEditions(adapter, source, { now, dryRun: false });

    const anomaly = detectAnomaly(summary, previousCount);
    if (anomaly) {
      status = "partial_success";
      errorSummary = anomaly;
      runLog.warn("crawl anomaly detected; data quality check flagged this run", { anomaly });
    } else if (summary.recordsFailed > 0) {
      status = "partial_success";
      errorSummary = `${summary.recordsFailed} record(s) failed to process`;
    }

    await db
      .update(crawlRuns)
      .set({
        finishedAt: new Date(),
        status,
        editionsDiscovered: summary.editionsDiscovered,
        recordsParsed: summary.recordsParsed,
        recordsInserted: summary.recordsInserted,
        recordsUpdated: summary.recordsUpdated,
        recordsUnchanged: summary.recordsUnchanged,
        recordsFailed: summary.recordsFailed,
        errorSummary,
        logJson: { records: summary.records.slice(0, 200) },
      })
      .where(eq(crawlRuns.id, run.id));

    // Reaching here means the try block completed without throwing, so this
    // run is "success" or "partial_success" — never "failed" (that path only
    // happens via the catch block below, which updates health separately).
    await db
      .update(sourceSeries)
      .set({
        lastCheckedAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(sourceSeries.id, source.id));

    runLog.info("crawl finished", { status, ...summary, records: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    runLog.error("crawl failed", { error: message });

    await db
      .update(crawlRuns)
      .set({ finishedAt: new Date(), status: "failed", errorSummary: String(error) })
      .where(eq(crawlRuns.id, run.id));

    await db
      .update(sourceSeries)
      .set({
        lastCheckedAt: new Date(),
        lastFailureAt: new Date(),
        consecutiveFailures: source.consecutiveFailures + 1,
        lastError: String(error),
        updatedAt: new Date(),
      })
      .where(eq(sourceSeries.id, source.id));
  }
}

export async function updateAllSources(): Promise<void> {
  const sources = await db.select().from(sourceSeries).where(eq(sourceSeries.enabled, true));
  log.info("starting daily crawl", { sourceCount: sources.length });

  for (const source of sources) {
    await runSourceSafely(source);
  }

  log.info("daily crawl complete");
}
