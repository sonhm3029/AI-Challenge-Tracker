import Link from "next/link";
import type { ChallengeListItem } from "@/lib/queries";
import { getNextRelevantMilestone } from "@/lib/challengeDeadline";
import { formatAbsoluteDate } from "@/lib/formatDate";
import { StatusBadge } from "@/components/StatusBadge";
import { DomainBadge } from "@/components/DomainBadge";
import { Countdown } from "@/components/Countdown";

/**
 * Section 24 — Challenge Card. Compact, information-first: name, venue/year,
 * domains, status, next milestone + countdown, absolute date, official link.
 */
export function ChallengeCard({ challenge }: { challenge: ChallengeListItem }) {
  const milestone = getNextRelevantMilestone(challenge);

  return (
    <Link
      href={`/challenges/${challenge.slug}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-stone-400 focus-visible:border-stone-400"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">{challenge.name}</h3>
        <StatusBadge status={challenge.status} />
      </div>

      <div className="text-xs text-stone-500">
        {challenge.venueName ? (
          <span>
            {challenge.venueName}
            {challenge.venueYear ? ` ${challenge.venueYear}` : ""}
          </span>
        ) : (
          <span>Independent challenge</span>
        )}
      </div>

      {challenge.domains.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {challenge.domains.map((d) => (
            <DomainBadge key={d} name={d} />
          ))}
        </div>
      )}

      <div className="mt-1 border-t border-border pt-2">
        {milestone ? (
          <>
            <div className="text-xs text-stone-500">{milestone.label}</div>
            <div className="flex items-baseline justify-between gap-2">
              <Countdown deadline={milestone.timestamp.toISOString()} />
              <span className="text-xs text-stone-500">{formatAbsoluteDate(milestone.timestamp)}</span>
            </div>
          </>
        ) : (
          <div className="text-xs text-stone-500">No upcoming milestone</div>
        )}
      </div>
    </Link>
  );
}
