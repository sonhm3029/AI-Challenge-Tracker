import { Suspense } from "react";
import { getHomepageSections, listAllDomains, listAllVenues, listChallengeYears, type ChallengeFilters } from "@/lib/queries";
import type { ChallengeStatus } from "@/db/schema";
import { ChallengeCard } from "@/components/ChallengeCard";
import { ChallengeFilters as ChallengeFiltersControl } from "@/components/ChallengeFilters";

// Section 37 — homepage refresh cadence: 5-15 minutes.
export const revalidate = 600;

const VALID_STATUSES: ChallengeStatus[] = ["open", "upcoming", "evaluation", "closed", "unknown"];

function parseFilters(searchParams: Record<string, string | string[] | undefined>): ChallengeFilters {
  const get = (key: string) => {
    const value = searchParams[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const status = get("status");
  const year = get("year");
  return {
    status: status && VALID_STATUSES.includes(status as ChallengeStatus) ? (status as ChallengeStatus) : undefined,
    domainSlug: get("domain") || undefined,
    venueSlug: get("venue") || undefined,
    year: year ? Number(year) : undefined,
    query: get("q") || undefined,
  };
}

function Section({ title, children, emptyMessage }: { title: string; children: React.ReactNode; emptyMessage: string; count: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children || <p className="text-sm text-stone-500">{emptyMessage}</p>}
    </section>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const resolvedSearchParams = await searchParams;
  const filters = parseFilters(resolvedSearchParams);

  const [{ open, upcoming, closed }, domains, venues, years] = await Promise.all([
    getHomepageSections(filters),
    listAllDomains(),
    listAllVenues(),
    listChallengeYears(),
  ]);

  const isFiltered = Boolean(filters.status || filters.domainSlug || filters.venueSlug || filters.year || filters.query);
  const totalResults = open.length + upcoming.length + closed.length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Academic AI Challenges</h1>
        <p className="text-sm text-stone-500">
          Deadlines and official links for AI/ML competitions, cups, and shared tasks across major research venues.
        </p>
      </div>

      <Suspense>
        <ChallengeFiltersControl
          options={{
            domains: domains.map((d) => ({ name: d.name, slug: d.slug })),
            venues: venues.map((v) => ({ name: v.name, slug: v.slug })),
            years,
          }}
        />
      </Suspense>

      {isFiltered && totalResults === 0 && (
        <p className="text-sm text-stone-500">No challenges match the current filters.</p>
      )}

      {(!isFiltered || filters.status === "open" || !filters.status) && (
        <Section title="Open now" emptyMessage="No challenges are currently open." count={open.length}>
          {open.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {open.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
        </Section>
      )}

      {(!isFiltered || filters.status === "upcoming" || !filters.status) && (
        <Section title="Upcoming" emptyMessage="No upcoming challenges known yet." count={upcoming.length}>
          {upcoming.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
        </Section>
      )}

      {(!isFiltered || filters.status === "closed" || !filters.status) && (
        <Section title="Recently closed" emptyMessage="Nothing has closed recently." count={closed.length}>
          {closed.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {closed.map((c) => (
                <ChallengeCard key={c.id} challenge={c} />
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
