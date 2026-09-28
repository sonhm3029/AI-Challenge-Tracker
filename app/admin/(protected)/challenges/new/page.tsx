import { db } from "@/lib/db/client";
import { venues } from "@/db/schema";
import { createChallengeAction } from "@/app/admin/actions";

export const metadata = { title: "New challenge" };

export default async function NewChallengePage() {
  const allVenues = await db.select().from(venues).orderBy(venues.name);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Create challenge manually</h1>
      <p className="max-w-xl text-sm text-stone-500">
        For irregular sources or newly-announced challenges a crawler doesn&apos;t cover yet (Section 50). This record is
        marked as manually created and a crawler will never overwrite it without an explicit override change.
      </p>
      <form action={createChallengeAction} className="flex max-w-xl flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Official URL
          <input name="officialUrl" required type="url" className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Venue
            <select name="venueSlug" className="rounded-md border border-border bg-surface px-3 py-2">
              <option value="">None</option>
              {allVenues.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Venue year
            <input name="venueYear" type="number" className="rounded-md border border-border bg-surface px-3 py-2" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea name="description" rows={3} className="rounded-md border border-border bg-surface px-3 py-2" />
        </label>
        <button type="submit" className="w-fit rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white dark:bg-stone-100 dark:text-stone-900">
          Create
        </button>
      </form>
    </div>
  );
}
