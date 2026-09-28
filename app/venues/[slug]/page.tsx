import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getVenueBySlug } from "@/lib/queries";
import { ChallengeCard } from "@/components/ChallengeCard";

// Section 37 — venue pages refresh every 15-60 minutes.
export const revalidate = 1800;

export async function generateMetadata({ params }: PageProps<"/venues/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const result = await getVenueBySlug(slug);
  if (!result) return {};
  return {
    title: `${result.venue.name} — Challenges by Year`,
    description: `Browse ${result.venue.name} challenges and competitions grouped by year, with deadlines and official links.`,
    alternates: { canonical: `/venues/${result.venue.slug}` },
  };
}

export default async function VenuePage({ params }: PageProps<"/venues/[slug]">) {
  const { slug } = await params;
  const result = await getVenueBySlug(slug);
  if (!result) notFound();

  const { venue, byYear } = result;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{venue.name}</h1>
        {venue.homepageUrl && (
          <a href={venue.homepageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline dark:text-blue-400">
            {venue.homepageUrl}
          </a>
        )}
      </div>

      {byYear.length === 0 && <p className="text-sm text-stone-500">No challenges tracked for this venue yet.</p>}

      {byYear.map(([year, challengesForYear]) => (
        <section key={year} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{year || "Year unknown"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {challengesForYear.map((c) => (
              <ChallengeCard key={c.id} challenge={c} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
