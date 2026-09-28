import { formatAbsoluteDate } from "@/lib/formatDate";

/**
 * Section 32 — Source Provenance, public-facing portion: last verified date
 * plus the official source URL(s) that back this record.
 */
export function SourceFreshness({ lastVerifiedAt, sourceUrls }: { lastVerifiedAt: Date; sourceUrls: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="text-stone-500">Last verified: {formatAbsoluteDate(lastVerifiedAt)}</div>
      {sourceUrls.length > 0 && (
        <div className="mt-2">
          <div className="text-xs font-medium text-stone-500">Official sources</div>
          <ul className="mt-1 flex flex-col gap-1">
            {sourceUrls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 underline dark:text-blue-400">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
