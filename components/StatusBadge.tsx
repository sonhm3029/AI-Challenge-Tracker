import type { ChallengeStatus } from "@/db/schema";

const LABELS: Record<ChallengeStatus, string> = {
  open: "Open",
  upcoming: "Upcoming",
  evaluation: "Evaluation",
  closed: "Closed",
  unknown: "Unknown",
};

// Section 54 — status is never color-only: each badge carries a distinct
// label and a small glyph, so it reads correctly without color vision.
const GLYPHS: Record<ChallengeStatus, string> = {
  open: "●",
  upcoming: "◐",
  evaluation: "◑",
  closed: "○",
  unknown: "?",
};

const CLASSES: Record<ChallengeStatus, string> = {
  open: "bg-[var(--status-open-bg)] text-[var(--status-open-fg)] border-[var(--status-open-border)]",
  upcoming: "bg-[var(--status-upcoming-bg)] text-[var(--status-upcoming-fg)] border-[var(--status-upcoming-border)]",
  evaluation: "bg-[var(--status-evaluation-bg)] text-[var(--status-evaluation-fg)] border-[var(--status-evaluation-border)]",
  closed: "bg-[var(--status-closed-bg)] text-[var(--status-closed-fg)] border-[var(--status-closed-border)]",
  unknown: "bg-[var(--status-unknown-bg)] text-[var(--status-unknown-fg)] border-[var(--status-unknown-border)]",
};

export function StatusBadge({ status }: { status: ChallengeStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${CLASSES[status]}`}
    >
      <span aria-hidden="true">{GLYPHS[status]}</span>
      {LABELS[status]}
    </span>
  );
}
