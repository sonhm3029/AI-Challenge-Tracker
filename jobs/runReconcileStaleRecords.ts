import "dotenv/config";
import { sql } from "@/lib/db/client";
import { reconcileStaleRecords } from "@/jobs/reconcileStaleRecords";
import { logger } from "@/lib/logger";

/** CLI entry point for `npm run reconcile:stale` — see jobs/runDailyCrawl.ts
 * for why this is a separate file from the importable job module. */
reconcileStaleRecords()
  .then(() => sql.end())
  .catch(async (error) => {
    logger.error("reconcileStaleRecords fatal error", { error: String(error) });
    await sql.end();
    process.exit(1);
  });
