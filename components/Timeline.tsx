import { formatAbsoluteDate } from "@/lib/formatDate";

export type TimelineEntry = { label: string; date: Date };

/**
 * Section 25 — Timeline: every known structured date for a challenge, in
 * chronological order.
 */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sorted.length === 0) {
    return <p className="text-sm text-stone-500">No structured dates are available for this challenge yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {sorted.map((entry, i) => (
        <li key={`${entry.label}-${i}`} className="flex items-start gap-3">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-stone-400" aria-hidden="true" />
          <div>
            <div className="text-sm font-medium">{formatAbsoluteDate(entry.date)}</div>
            <div className="text-xs text-stone-500">{entry.label}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
