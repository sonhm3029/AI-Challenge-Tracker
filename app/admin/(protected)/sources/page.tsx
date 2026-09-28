import { db } from "@/lib/db/client";
import { sourceSeries, venues } from "@/db/schema";
import { eq } from "drizzle-orm";
import { classifySourceHealth } from "@/jobs/healthReport";
import { toggleSourceEnabledAction, triggerCrawlAction } from "@/app/admin/actions";

export const metadata = { title: "Sources" };

export default async function AdminSourcesPage() {
  const sources = await db
    .select({ source: sourceSeries, venueName: venues.name })
    .from(sourceSeries)
    .leftJoin(venues, eq(sourceSeries.venueId, venues.id))
    .orderBy(sourceSeries.name);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Sources</h1>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-stone-500">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Venue</th>
              <th className="p-3">Adapter</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last checked</th>
              <th className="p-3">Failures</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(({ source, venueName }) => {
              const status = classifySourceHealth(source);
              return (
                <tr key={source.id} className="border-b border-border last:border-0 align-top">
                  <td className="p-3 font-medium">{source.name}</td>
                  <td className="p-3 text-stone-500">{venueName ?? "—"}</td>
                  <td className="p-3 font-mono text-xs text-stone-500">{source.adapterName}</td>
                  <td className="p-3 capitalize">{status}</td>
                  <td className="p-3 text-stone-500">{source.lastCheckedAt?.toLocaleString() ?? "never"}</td>
                  <td className="p-3 text-stone-500">
                    {source.consecutiveFailures}
                    {source.lastError && <div className="max-w-xs truncate text-xs text-red-600" title={source.lastError}>{source.lastError}</div>}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <form action={toggleSourceEnabledAction.bind(null, source.id, !source.enabled)}>
                        <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                          {source.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      <form action={triggerCrawlAction.bind(null, source.id)}>
                        <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                          Run crawl now
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
