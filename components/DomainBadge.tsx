export function DomainBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-stone-600 dark:text-stone-300">
      {name}
    </span>
  );
}
