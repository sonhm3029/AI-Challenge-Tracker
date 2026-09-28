import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { challengeDomains, challengeLinks, challengeSourceRecords, challenges, domains, fieldOverrides, sourceSeries, venues } from "@/db/schema";
import { challengeStatusValues } from "@/db/schema";
import { updateChallengeAction, updateChallengeDomainsAction, clearOverrideAction } from "@/app/admin/actions";

export const metadata = { title: "Edit challenge" };

function dateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 16);
}

export default async function AdminChallengeEditPage({ params }: PageProps<"/admin/challenges/[id]">) {
  const { id } = await params;

  const [row] = await db
    .select({ challenge: challenges, venueName: venues.name })
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(eq(challenges.id, id))
    .limit(1);
  if (!row) notFound();
  const { challenge } = row;

  const [allDomains, challengeDomainRows, links, overrides, sourceRecords] = await Promise.all([
    db.select().from(domains).orderBy(domains.name),
    db.select({ domainId: challengeDomains.domainId }).from(challengeDomains).where(eq(challengeDomains.challengeId, id)),
    db.select().from(challengeLinks).where(eq(challengeLinks.challengeId, id)),
    db.select().from(fieldOverrides).where(eq(fieldOverrides.challengeId, id)),
    db
      .select({ record: challengeSourceRecords, sourceName: sourceSeries.name })
      .from(challengeSourceRecords)
      .leftJoin(sourceSeries, eq(challengeSourceRecords.sourceSeriesId, sourceSeries.id))
      .where(eq(challengeSourceRecords.challengeId, id)),
  ]);

  const selectedDomainIds = new Set(challengeDomainRows.map((d) => d.domainId));
  const boundUpdate = updateChallengeAction.bind(null, id);
  const boundDomains = updateChallengeDomainsAction.bind(null, id);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">{challenge.name}</h1>
        <p className="text-sm text-stone-500">{row.venueName} {challenge.venueYear}</p>
      </div>

      <form action={boundUpdate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Name
          <input name="name" defaultValue={challenge.name} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Short name
          <input name="shortName" defaultValue={challenge.shortName ?? ""} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Host platform
          <input name="hostPlatform" defaultValue={challenge.hostPlatform ?? ""} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Description
          <textarea name="description" defaultValue={challenge.description ?? ""} rows={3} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Official URL
          <input name="officialUrl" defaultValue={challenge.officialUrl} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Timezone
          <input name="timezone" defaultValue={challenge.timezone ?? ""} placeholder="e.g. Etc/GMT+12" className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Status override
          <select name="status" defaultValue={challenge.status} className="rounded-md border border-border bg-surface px-3 py-2">
            {challengeStatusValues.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Dates</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["registrationStart", "Registration opens"],
                ["registrationDeadline", "Registration deadline"],
                ["challengeStart", "Challenge starts"],
                ["challengeEnd", "Challenge ends"],
                ["submissionDeadline", "Submission deadline"],
                ["evaluationStart", "Evaluation starts"],
                ["evaluationEnd", "Evaluation ends"],
                ["workshopDate", "Workshop date"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1 text-sm">
                {label}
                <input
                  type="datetime-local"
                  name={field}
                  defaultValue={dateInputValue(challenge[field])}
                  className="rounded-md border border-border bg-surface px-3 py-2"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="md:col-span-2">
          <button type="submit" className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">
            Save changes
          </button>
        </div>
      </form>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Domains</h2>
        <form action={boundDomains} className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            {allDomains.map((d) => (
              <label key={d.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="domainIds" value={d.id} defaultChecked={selectedDomainIds.has(d.id)} />
                {d.name}
              </label>
            ))}
          </div>
          <button type="submit" className="w-fit rounded-md border border-border px-3 py-1.5 text-sm">
            Save domains
          </button>
        </form>
      </div>

      {overrides.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Manual overrides (Section 9.11)</h2>
          <p className="mb-2 text-xs text-stone-500">
            These fields will never be overwritten by a future crawl. Clear an override to let the crawler manage that field again.
          </p>
          <ul className="flex flex-col gap-2">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3 text-sm">
                <div>
                  <div className="font-mono text-xs">{o.fieldName}</div>
                  <div className="text-xs text-stone-500">{JSON.stringify(o.overrideValue)}</div>
                </div>
                <form action={clearOverrideAction.bind(null, id, o.fieldName)}>
                  <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                    Clear override
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Links</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {links.map((l) => (
            <li key={l.id}>
              <span className="text-xs text-stone-500">[{l.linkType}]</span>{" "}
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline dark:text-blue-400">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Source provenance (Section 32)</h2>
        <div className="flex flex-col gap-3">
          {sourceRecords.map(({ record, sourceName }) => (
            <details key={record.id} className="rounded-md border border-border bg-surface p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                {sourceName} — {record.sourceUrl}
              </summary>
              <div className="mt-2 text-xs text-stone-500">
                <div>External key: {record.externalKey ?? "—"}</div>
                <div>Content hash: {record.contentHash}</div>
                <div>First seen: {record.firstSeenAt.toLocaleString()}</div>
                <div>Last seen: {record.lastSeenAt.toLocaleString()}</div>
              </div>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-stone-100 p-2 text-xs dark:bg-stone-800">
                {JSON.stringify(record.rawPayloadJson, null, 2)}
              </pre>
            </details>
          ))}
          {sourceRecords.length === 0 && <p className="text-sm text-stone-500">No scraper provenance — this record was created manually.</p>}
        </div>
      </div>
    </div>
  );
}
