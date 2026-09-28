import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getChallengeBySlug } from "@/lib/queries";
import { getNextRelevantMilestone } from "@/lib/challengeDeadline";
import { formatAbsoluteDateTime } from "@/lib/formatDate";
import { StatusBadge } from "@/components/StatusBadge";
import { DomainBadge } from "@/components/DomainBadge";
import { Countdown } from "@/components/Countdown";
import { Timeline, type TimelineEntry } from "@/components/Timeline";
import { SourceFreshness } from "@/components/SourceFreshness";

// Section 37 — challenge pages refresh every 15-60 minutes.
export const revalidate = 1800;

function buildTimeline(challenge: NonNullable<Awaited<ReturnType<typeof getChallengeBySlug>>>["challenge"]): TimelineEntry[] {
  const entries: [string, Date | null][] = [
    ["Registration opens", challenge.registrationStart],
    ["Registration deadline", challenge.registrationDeadline],
    ["Challenge starts", challenge.challengeStart],
    ["Submission deadline", challenge.submissionDeadline],
    ["Challenge ends", challenge.challengeEnd],
    ["Evaluation starts", challenge.evaluationStart],
    ["Evaluation ends", challenge.evaluationEnd],
    ["Workshop", challenge.workshopDate],
  ];
  return entries.filter((e): e is [string, Date] => e[1] !== null).map(([label, date]) => ({ label, date }));
}

export async function generateMetadata({ params }: PageProps<"/challenges/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getChallengeBySlug(slug);
  if (!result) return {};

  const { challenge, venue } = result;
  const venueLabel = venue ? `${venue.name}${challenge.venueYear ? ` ${challenge.venueYear}` : ""}` : undefined;
  const title = `${challenge.name} — Deadline, Dates & Official Links`;
  const description =
    challenge.description?.slice(0, 160) ??
    `Track deadlines and official links for ${challenge.name}${venueLabel ? ` (${venueLabel})` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: `/challenges/${challenge.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function ChallengeDetailPage({ params }: PageProps<"/challenges/[slug]">) {
  const { slug } = await params;
  const result = await getChallengeBySlug(slug);
  if (!result) notFound();

  const { challenge, venue, links, domains, sourceRecords } = result;
  const milestone = getNextRelevantMilestone(challenge);
  const timeline = buildTimeline(challenge);
  const sourceUrls = [...new Set(sourceRecords.map((r) => r.sourceUrl))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{challenge.name}</h1>
          <StatusBadge status={challenge.status} />
        </div>
        <div className="text-sm text-stone-500">
          {venue && (
            <span>
              {venue.name}
              {challenge.venueYear ? ` ${challenge.venueYear}` : ""}
            </span>
          )}
          {challenge.hostPlatform && <span> · Hosted on {challenge.hostPlatform}</span>}
        </div>
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {domains.map((d) => (
              <DomainBadge key={d.slug} name={d.name} />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-6 md:col-span-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            {milestone ? (
              <>
                <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{milestone.label}</div>
                <div className="mt-1 flex items-baseline gap-3">
                  <Countdown deadline={milestone.timestamp.toISOString()} />
                  <span className="text-sm text-stone-500">{formatAbsoluteDateTime(milestone.timestamp)}</span>
                </div>
                {challenge.timezoneOriginal && (
                  <div className="mt-1 text-xs text-stone-500">Timezone as published: {challenge.timezoneOriginal}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-stone-500">No upcoming milestone — this challenge is closed.</div>
            )}
          </div>

          {challenge.description && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">About</h2>
              <p className="mt-2 text-sm leading-relaxed">{challenge.description}</p>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Timeline</h2>
            <div className="mt-3">
              <Timeline entries={timeline} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Links</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {links.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-700 underline underline-offset-2 dark:text-blue-400"
                  >
                    {link.label}
                    {link.isPrimary ? " →" : ""}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <SourceFreshness lastVerifiedAt={challenge.lastVerifiedAt} sourceUrls={sourceUrls} />
        </div>
      </div>
    </div>
  );
}
