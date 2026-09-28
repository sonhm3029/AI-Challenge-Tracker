import Link from "next/link";
import { desc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { challenges, venues } from "@/db/schema";
import { findPossibleDuplicates } from "@/lib/dedupe";
import { mergeChallengesAction, setArchivedAction, setHiddenAction } from "@/app/admin/actions";

export const metadata = { title: "Admin: Challenges" };

export default async function AdminChallengesPage({ searchParams }: PageProps<"/admin/challenges">) {
  const resolved = await searchParams;
  const q = typeof resolved.q === "string" ? resolved.q : undefined;

  const rows = await db
    .select({ challenge: challenges, venueName: venues.name })
    .from(challenges)
    .leftJoin(venues, eq(challenges.venueId, venues.id))
    .where(q ? ilike(challenges.name, `%${q}%`) : undefined)
    .orderBy(desc(challenges.lastSeenAt))
    .limit(200);

  const duplicates = await findPossibleDuplicates();

  return (
    <div className="flex flex-col gap-4">
      {duplicates.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
          <h2 className="mb-2 font-semibold">
            Possible duplicates (Section 51) — {duplicates.length} pair{duplicates.length === 1 ? "" : "s"}
          </h2>
          <p className="mb-3 text-xs text-stone-600 dark:text-stone-300">
            Same venue + year with a similar name. Not auto-merged (Section 17) — review and pick which one to keep.
          </p>
          <ul className="flex flex-col gap-2">
            {duplicates.map(({ a, b, similarity }) => (
              <li key={`${a.id}-${b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/60 p-2 dark:bg-black/20">
                <div className="text-xs">
                  <span className="font-medium">{a.name}</span> vs <span className="font-medium">{b.name}</span>{" "}
                  <span className="text-stone-500">({Math.round(similarity * 100)}% similar)</span>
                </div>
                <div className="flex gap-2">
                  <form action={mergeChallengesAction.bind(null, a.id, b.id)}>
                    <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                      Keep &quot;{a.name}&quot;
                    </button>
                  </form>
                  <form action={mergeChallengesAction.bind(null, b.id, a.id)}>
                    <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                      Keep &quot;{b.name}&quot;
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Challenges</h1>
        <div className="flex items-center gap-3">
          <form className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by name…"
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            />
          </form>
          <Link href="/admin/challenges/new" className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-sm">
            + New challenge
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-stone-500">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Venue</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last seen</th>
              <th className="p-3">Flags</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ challenge, venueName }) => (
              <tr key={challenge.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <Link href={`/admin/challenges/${challenge.id}`} className="font-medium hover:underline">
                    {challenge.name}
                  </Link>
                </td>
                <td className="p-3 text-stone-500">
                  {venueName}
                  {challenge.venueYear ? ` ${challenge.venueYear}` : ""}
                </td>
                <td className="p-3 capitalize">{challenge.status}</td>
                <td className="p-3 text-stone-500">{challenge.lastSeenAt.toLocaleDateString()}</td>
                <td className="p-3 text-xs text-stone-500">
                  {challenge.isManuallyCreated && <span className="mr-1 rounded bg-stone-200 px-1 dark:bg-stone-700">manual</span>}
                  {challenge.isHidden && <span className="mr-1 rounded bg-amber-200 px-1 dark:bg-amber-800">hidden</span>}
                  {!challenge.isActive && <span className="rounded bg-red-200 px-1 dark:bg-red-900">archived</span>}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    <form action={setHiddenAction.bind(null, challenge.id, !challenge.isHidden)}>
                      <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                        {challenge.isHidden ? "Unhide" : "Hide"}
                      </button>
                    </form>
                    <form action={setArchivedAction.bind(null, challenge.id, !challenge.isActive)}>
                      <button type="submit" className="text-xs text-blue-700 underline dark:text-blue-400">
                        {challenge.isActive ? "Archive" : "Unarchive"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
