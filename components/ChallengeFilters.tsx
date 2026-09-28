"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type FilterOptions = {
  domains: { name: string; slug: string }[];
  venues: { name: string; slug: string }[];
  years: number[];
};

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: "open", label: "Open" },
  { value: "upcoming", label: "Upcoming" },
  { value: "evaluation", label: "Evaluation" },
  { value: "closed", label: "Closed" },
];

/**
 * Section 28 — Filters (status/domain/venue/year) plus the free-text search
 * box (Section 27). Filter state lives entirely in the URL query string so
 * the results themselves stay server-rendered (Section 57: no client-side
 * fetch waterfall for the listing itself — only navigation triggers it).
 */
export function ChallengeFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query !== (searchParams.get("q") ?? "")) updateParam("q", query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search challenges, venues, tags…"
        aria-label="Search challenges"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-stone-400"
      />

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by status"
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by domain"
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={searchParams.get("domain") ?? ""}
          onChange={(e) => updateParam("domain", e.target.value)}
        >
          <option value="">Any domain</option>
          {options.domains.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by venue"
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={searchParams.get("venue") ?? ""}
          onChange={(e) => updateParam("venue", e.target.value)}
        >
          <option value="">Any venue</option>
          {options.venues.map((v) => (
            <option key={v.slug} value={v.slug}>
              {v.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by year"
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
          value={searchParams.get("year") ?? ""}
          onChange={(e) => updateParam("year", e.target.value)}
        >
          <option value="">Any year</option>
          {options.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
