import Link from "next/link";
import { getSourceHealthReport } from "@/jobs/healthReport";
import { getChallengeCountByStatus } from "@/lib/queries";

export const metadata = { title: "Admin dashboard" };

const STATUS_DOT: Record<string, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  failing: "bg-red-500",
  disabled: "bg-stone-400",
};

export default async function AdminDashboardPage() {
  const [health, counts] = await Promise.all([getSourceHealthReport(), getChallengeCountByStatus()]);

  const failing = health.filter((h) => h.status === "failing");
  const warning = health.filter((h) => h.status === "warning" && h.lastCheckedAt);

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counts.map((c) => (
          <div key={c.status} className="rounded-lg border border-border bg-surface p-4">
            <div className="text-2xl font-semibold">{c.count}</div>
            <div className="text-xs capitalize text-stone-500">{c.status}</div>
          </div>
        ))}
      </div>

      {failing.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:border-red-900 dark:bg-red-950">
          <strong>{failing.length}</strong> source(s) are failing (≥3 consecutive crawl failures) — see{" "}
          <Link href="/admin/sources" className="underline">
            Sources
          </Link>
          .
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Source health</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-stone-500">
              <tr>
                <th className="p-3">Source</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last checked</th>
                <th className="p-3">Consecutive failures</th>
              </tr>
            </thead>
            <tbody>
              {health.map((h) => (
                <tr key={h.slug} className="border-b border-border last:border-0">
                  <td className="p-3">{h.name}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[h.status]}`} />
                      {h.status}
                    </span>
                  </td>
                  <td className="p-3 text-stone-500">{h.lastCheckedAt?.toLocaleString() ?? "never"}</td>
                  <td className="p-3 text-stone-500">{h.consecutiveFailures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {warning.length > 0 && (
        <p className="text-xs text-stone-500">{warning.length} source(s) have 1-2 recent failures — watch these.</p>
      )}
    </div>
  );
}
