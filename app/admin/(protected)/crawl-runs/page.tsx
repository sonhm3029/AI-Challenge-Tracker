import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { crawlRuns, sourceSeries } from "@/db/schema";

export const metadata = { title: "Crawl runs" };

const STATUS_COLOR: Record<string, string> = {
  success: "text-emerald-600",
  partial_success: "text-amber-600",
  failed: "text-red-600",
  running: "text-stone-500",
};

export default async function AdminCrawlRunsPage() {
  const runs = await db
    .select({ run: crawlRuns, sourceName: sourceSeries.name })
    .from(crawlRuns)
    .leftJoin(sourceSeries, eq(crawlRuns.sourceSeriesId, sourceSeries.id))
    .orderBy(desc(crawlRuns.startedAt))
    .limit(100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Crawl runs</h1>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-stone-500">
            <tr>
              <th className="p-3">Source</th>
              <th className="p-3">Started</th>
              <th className="p-3">Status</th>
              <th className="p-3">Editions</th>
              <th className="p-3">Parsed</th>
              <th className="p-3">Inserted</th>
              <th className="p-3">Updated</th>
              <th className="p-3">Unchanged</th>
              <th className="p-3">Failed</th>
              <th className="p-3">Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(({ run, sourceName }) => (
              <tr key={run.id} className="border-b border-border last:border-0">
                <td className="p-3">{sourceName ?? "—"}</td>
                <td className="p-3 text-stone-500">{run.startedAt.toLocaleString()}</td>
                <td className={`p-3 font-medium ${STATUS_COLOR[run.status] ?? ""}`}>{run.status}</td>
                <td className="p-3">{run.editionsDiscovered}</td>
                <td className="p-3">{run.recordsParsed}</td>
                <td className="p-3">{run.recordsInserted}</td>
                <td className="p-3">{run.recordsUpdated}</td>
                <td className="p-3">{run.recordsUnchanged}</td>
                <td className="p-3">{run.recordsFailed}</td>
                <td className="max-w-xs truncate p-3 text-xs text-red-600" title={run.errorSummary ?? undefined}>
                  {run.errorSummary}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={10} className="p-3 text-center text-stone-500">
                  No crawl runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
