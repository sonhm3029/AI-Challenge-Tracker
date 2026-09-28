import "dotenv/config";
import { sql } from "@/lib/db/client";
import { updateAllSources } from "@/jobs/updateAllSources";
import { logger } from "@/lib/logger";

/**
 * CLI entry point for `npm run crawl:all` (Section 20, Section 59, and the
 * `.github/workflows/daily-crawl.yml` scheduled job). Deliberately a
 * separate file from jobs/updateAllSources.ts: that module is also imported
 * by the admin console (for `runSourceSafely`) and by Next.js at build
 * time, so it must have no top-level side effects — only this dedicated
 * script actually invokes the crawl and exits the process.
 */
updateAllSources()
  .then(() => sql.end())
  .catch(async (error) => {
    logger.error("daily crawl fatal error", { error: String(error) });
    await sql.end();
    process.exit(1);
  });
