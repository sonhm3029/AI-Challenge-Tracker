import "dotenv/config";
import { db, sql } from "@/lib/db/client";
import { sourceSeries } from "@/db/schema";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "healthReport" });

export type SourceHealthStatus = "healthy" | "warning" | "failing" | "disabled";

export type SourceHealth = {
  slug: string;
  name: string;
  status: SourceHealthStatus;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
};

/**
 * Section 21 — Source Health status badges.
 *   Healthy: latest run success (0 consecutive failures, has run at least once)
 *   Warning: 1-2 consecutive failures
 *   Failing: >=3 consecutive failures
 *   Disabled: source_series.enabled = false
 */
export function classifySourceHealth(source: {
  enabled: boolean;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
}): SourceHealthStatus {
  if (!source.enabled) return "disabled";
  if (!source.lastCheckedAt) return "warning"; // never run yet
  if (source.consecutiveFailures >= 3) return "failing";
  if (source.consecutiveFailures >= 1) return "warning";
  return "healthy";
}

export async function getSourceHealthReport(): Promise<SourceHealth[]> {
  const sources = await db.select().from(sourceSeries);
  return sources.map((s) => ({
    slug: s.slug,
    name: s.name,
    status: classifySourceHealth(s),
    lastCheckedAt: s.lastCheckedAt,
    lastSuccessAt: s.lastSuccessAt,
    lastFailureAt: s.lastFailureAt,
    consecutiveFailures: s.consecutiveFailures,
    lastError: s.lastError,
  }));
}

/**
 * Section 40 — Recommended Alerts. Emits a structured `ALERT` log line
 * (grep-able from GitHub Actions logs) for each condition; wiring this to
 * email/a GitHub issue is a small follow-up (see docs/crawler-operations.md)
 * once real delivery credentials exist — the detection logic itself is what
 * matters for production readiness, not the transport.
 */
export async function checkAlertConditions(): Promise<string[]> {
  const report = await getSourceHealthReport();
  const alerts: string[] = [];

  for (const source of report) {
    if (source.status === "failing") {
      alerts.push(`source "${source.name}" has failed ${source.consecutiveFailures} consecutive runs: ${source.lastError}`);
    }
  }

  for (const alert of alerts) {
    log.error(`ALERT: ${alert}`);
  }

  return alerts;
}

if (process.argv[1]?.endsWith("healthReport.ts")) {
  getSourceHealthReport()
    .then(async (report) => {
      for (const source of report) {
        log.info("source health", source as unknown as Record<string, unknown>);
      }
      await checkAlertConditions();
      await sql.end();
    })
    .catch(async (error) => {
      log.error("healthReport failed", { error: String(error) });
      await sql.end();
      process.exit(1);
    });
}
