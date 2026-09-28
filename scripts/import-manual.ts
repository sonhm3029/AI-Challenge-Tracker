import "dotenv/config";
import { readFileSync } from "node:fs";
import { db, sql } from "@/lib/db/client";
import { challengeDomains, challengeLinks, challenges } from "@/db/schema";
import { buildChallengeSlug } from "@/lib/slug";
import { getVenueIdBySlug, resolveDomainIds } from "@/lib/taxonomy";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import { logger } from "@/lib/logger";

const log = logger.child({ component: "import-manual" });

type ManualImportRow = {
  name: string;
  officialUrl: string;
  venueSlug?: string;
  venueYear?: number;
  description?: string;
  domains?: string[];
  registrationDeadline?: string;
  submissionDeadline?: string;
  workshopDate?: string;
};

function parseInputFile(path: string): ManualImportRow[] {
  if (path.endsWith(".json")) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  if (path.endsWith(".csv")) {
    const [header, ...lines] = readFileSync(path, "utf-8").trim().split("\n");
    const columns = header.split(",").map((c) => c.trim());
    return lines.map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      columns.forEach((col, i) => (row[col] = values[i] ?? ""));
      return {
        name: row.name,
        officialUrl: row.officialUrl,
        venueSlug: row.venueSlug || undefined,
        venueYear: row.venueYear ? Number(row.venueYear) : undefined,
        description: row.description || undefined,
        domains: row.domains ? row.domains.split("|") : undefined,
        registrationDeadline: row.registrationDeadline || undefined,
        submissionDeadline: row.submissionDeadline || undefined,
        workshopDate: row.workshopDate || undefined,
      } satisfies ManualImportRow;
    });
  }
  throw new Error(`Unsupported file extension for ${path} (expected .json or .csv)`);
}

/**
 * Section 65 — one-time seed imports from CSV/JSON, always marked
 * `is_manually_created = true` so it's clear these did not come from a
 * verified official-source crawl (Section 67: no fabricated data in
 * production — this script is for genuinely curating known-real challenges
 * a crawler doesn't cover yet).
 */
async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: tsx scripts/import-manual.ts <file.json|file.csv>");
    process.exit(1);
  }

  const rows = parseInputFile(path);
  let imported = 0;

  for (const row of rows) {
    const venueId = row.venueSlug ? await getVenueIdBySlug(row.venueSlug) : undefined;
    const domainIds = await resolveDomainIds(row.domains);
    const slug = buildChallengeSlug(row.name, row.venueYear);
    const now = new Date();

    const [inserted] = await db
      .insert(challenges)
      .values({
        slug,
        name: row.name,
        description: row.description,
        venueId,
        venueYear: row.venueYear,
        status: "unknown",
        officialUrl: row.officialUrl,
        registrationDeadline: row.registrationDeadline ? parseHumanDate(row.registrationDeadline).value : null,
        submissionDeadline: row.submissionDeadline ? parseHumanDate(row.submissionDeadline).value : null,
        workshopDate: row.workshopDate ? parseHumanDate(row.workshopDate).value : null,
        firstSeenAt: now,
        lastSeenAt: now,
        lastVerifiedAt: now,
        isManuallyCreated: true,
      })
      .onConflictDoNothing({ target: challenges.slug })
      .returning({ id: challenges.id });

    if (!inserted) {
      log.warn("skipped row (slug already exists)", { slug });
      continue;
    }

    await db.insert(challengeLinks).values({ challengeId: inserted.id, label: "Official website", url: row.officialUrl, linkType: "official", isPrimary: true });
    for (const domainId of domainIds) {
      await db.insert(challengeDomains).values({ challengeId: inserted.id, domainId }).onConflictDoNothing();
    }
    imported += 1;
  }

  log.info("manual import complete", { imported, total: rows.length });
  await sql.end();
}

main().catch(async (error) => {
  log.error("import-manual failed", { error: String(error) });
  await sql.end();
  process.exit(1);
});
