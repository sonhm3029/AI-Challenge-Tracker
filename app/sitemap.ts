import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { challenges, venues } from "@/db/schema";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [challengeRows, venueRows] = await Promise.all([
    db.select({ slug: challenges.slug, updatedAt: challenges.updatedAt }).from(challenges).where(eq(challenges.isHidden, false)),
    db.select({ slug: venues.slug }).from(venues),
  ]);

  return [
    { url: siteUrl, changeFrequency: "hourly", priority: 1 },
    { url: `${siteUrl}/calendar`, changeFrequency: "hourly", priority: 0.8 },
    ...venueRows.map((v) => ({ url: `${siteUrl}/venues/${v.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...challengeRows.map((c) => ({
      url: `${siteUrl}/challenges/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
