import Link from "next/link";
import { getUpcomingMilestones } from "@/lib/queries";
import { getNextRelevantMilestone, type MilestoneType } from "@/lib/challengeDeadline";
import { formatAbsoluteDate } from "@/lib/formatDate";

// Section 37 — calendar refreshes every 15-60 minutes (treated like a
// challenge/venue listing page).
export const revalidate = 1800;

export const metadata = {
  title: "Calendar",
  description: "A chronological agenda of upcoming deadlines across every tracked AI/ML challenge.",
};

const MILESTONE_LABELS: Record<MilestoneType, string> = {
  registration_deadline: "registration deadline",
  submission_deadline: "submission deadline",
  challenge_end: "challenge ends",
  evaluation_end: "evaluation closes",
  workshop_date: "workshop",
};

/**
 * Section 31 — Calendar Page. A chronological agenda (not a month grid) of
 * every challenge's next milestone, grouped by month.
 */
export default async function CalendarPage() {
  const challenges = await getUpcomingMilestones();

  const entries = challenges
    .map((c) => ({ challenge: c, milestone: getNextRelevantMilestone(c) }))
    .filter((e): e is { challenge: (typeof challenges)[number]; milestone: NonNullable<ReturnType<typeof getNextRelevantMilestone>> } => e.milestone !== null)
    .sort((a, b) => a.milestone.timestamp.getTime() - b.milestone.timestamp.getTime());

  const byMonth = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.milestone.timestamp.toLocaleDateString("en-US", { year: "numeric", month: "long" });
    const list = byMonth.get(key) ?? [];
    list.push(entry);
    byMonth.set(key, list);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-sm text-stone-500">Every upcoming deadline, in order.</p>
      </div>

      {entries.length === 0 && <p className="text-sm text-stone-500">No upcoming deadlines are currently known.</p>}

      {[...byMonth.entries()].map(([month, monthEntries]) => (
        <section key={month} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{month}</h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {monthEntries.map(({ challenge, milestone }) => (
              <li key={challenge.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <Link href={`/challenges/${challenge.slug}`} className="font-medium hover:underline">
                    {challenge.name}
                  </Link>
                  <div className="text-xs text-stone-500">
                    {challenge.venueName}
                    {challenge.venueYear ? ` ${challenge.venueYear}` : ""} · {MILESTONE_LABELS[milestone.type]}
                  </div>
                </div>
                <div className="whitespace-nowrap text-xs font-medium text-stone-600 dark:text-stone-300">
                  {formatAbsoluteDate(milestone.timestamp)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
