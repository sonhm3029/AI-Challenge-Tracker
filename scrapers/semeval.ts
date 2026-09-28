import * as cheerio from "cheerio";
import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchHtml } from "@/lib/scraping/fetchHtml";
import { extractAllLinks } from "@/lib/scraping/extractLinks";
import type { LabeledDateText } from "@/lib/scraping/extractImportantDates";
import { classifyMilestoneLabel } from "@/lib/scraping/classifyMilestone";
import { detectHostPlatform } from "@/lib/scraping/detectPlatformLinks";
import { normalizeUrl } from "@/lib/scraping/normalizeUrl";
import { parseHumanDate } from "@/lib/scraping/parseDates";
import type { ParsedDate } from "@/lib/dates/parsedDate";
import type { ChallengeSourceAdapter, ScrapedChallenge, SourceEditionCandidate } from "@/scrapers/types";

/**
 * SemEval.
 *
 * Discovery strategy: stable series homepage (Section 11.3). `semeval.github.io`
 * links to a dedicated per-year page for every edition (e.g. SemEval2025,
 * SemEval2026); we parse those links rather than guessing at a URL pattern
 * so a brand-new year is picked up automatically as soon as the organizers
 * add it to the homepage. Older editions before the current GitHub Pages
 * naming convention (e.g. SemEval-2020, hosted at alt.qcri.org) use a
 * different domain/URL shape entirely and are intentionally excluded here.
 *
 * Each year hosts MANY independently-organized shared tasks (its own
 * "Task N: ..." entry on that year's tasks.html page, usually linking out to
 * a completely separate site the task organizers control). fetchChallenges
 * returns one ScrapedChallenge per task, linking each to whatever official
 * URL the yearly listing page gives for it. SemEval's "Important dates"
 * section is published once per year (shared across every task on that
 * page, not per task), so those structured dates are extracted once and
 * applied to every task from that edition.
 */
const HOMEPAGE_URL = "https://semeval.github.io/";

const MONTH_NAMES =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function dateRegex(): RegExp {
  // Matches "15 July 2024" style dates anywhere in a string (SemEval's
  // per-year timeline puts the date *after* the label, with no separator,
  // e.g. "Evaluation start 10 January 2025" or "Notification to authors
  // 31 March 2025 7 April 2025" once a superseded date has been struck
  // through and a new one appended) — unlike the generic
  // extractLabeledDatesFromLines helper, which requires a ":"/"–"/"—"
  // separator between label and date and so misses this page's format.
  return new RegExp(`\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTH_NAMES})\\.?\\s+\\d{4}`, "gi");
}

/**
 * Extracts (label, date) rows from a SemEval "Important dates" <ul>. When a
 * line lists more than one date (an earlier, struck-through deadline
 * followed by its replacement), the *last* date in the line is taken as
 * authoritative, matching how the page visually presents supersession.
 */
function extractSemevalTimelineRows($: CheerioAPI, ul: Cheerio<AnyNode>): LabeledDateText[] {
  const rows: LabeledDateText[] = [];

  ul.find("li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const matches = [...text.matchAll(dateRegex())];
    if (matches.length === 0) return;

    const lastMatch = matches[matches.length - 1];
    const dateText = lastMatch[0];
    const label = text
      .slice(0, lastMatch.index)
      .replace(dateRegex(), "")
      .replace(/[:\-–—]\s*$/, "")
      .trim();

    if (!label) return;
    rows.push({ label, dateText });
  });

  return rows;
}

type DateFieldName =
  | "registrationStart"
  | "registrationDeadline"
  | "challengeStart"
  | "challengeEnd"
  | "submissionDeadline"
  | "evaluationStart"
  | "evaluationEnd"
  | "workshopDate";

// SemEval-specific wording that the shared classifyMilestoneLabel rules
// don't already cover (e.g. "Evaluation start" rather than "Evaluation
// starts") — checked first, falling back to the shared rules for anything
// SemEval phrases the same way other adapters' sites do (e.g. "submission
// due", "workshop").
const SEMEVAL_EXTRA_RULES: { field: DateFieldName; keywords: RegExp }[] = [
  { field: "challengeStart", keywords: /tasks? announced|training data ready|sample data ready/i },
  { field: "evaluationStart", keywords: /evaluation start/i },
  { field: "evaluationEnd", keywords: /evaluation end/i },
];

function classifySemevalLabel(label: string): DateFieldName | null {
  for (const rule of SEMEVAL_EXTRA_RULES) {
    if (rule.keywords.test(label)) return rule.field;
  }
  return classifyMilestoneLabel(label) as DateFieldName | null;
}

function buildTimelineDateFields(rows: LabeledDateText[]): Partial<Record<DateFieldName, ParsedDate>> {
  const result: Partial<Record<DateFieldName, ParsedDate>> = {};
  for (const row of rows) {
    const field = classifySemevalLabel(row.label);
    if (!field || result[field]) continue;
    const parsed = parseHumanDate(row.dateText);
    if (parsed.value) result[field] = parsed;
  }
  return result;
}

const DOMAIN_KEYWORD_RULES: { domain: string; keywords: RegExp }[] = [
  { domain: "Multimodal", keywords: /multimodal/i },
  { domain: "LLM", keywords: /\bLLMs?\b|large language model/i },
  { domain: "Information Retrieval", keywords: /retrieval|tabular data|question-answering/i },
];

function inferDomains(title: string): string[] {
  const domains = new Set<string>(["NLP"]);
  for (const rule of DOMAIN_KEYWORD_RULES) {
    if (rule.keywords.test(title)) domains.add(rule.domain);
  }
  return Array.from(domains);
}

type SemevalTask = {
  number: number;
  title: string;
  href: string;
  organizers?: string;
};

/**
 * Parses a SemEval yearly tasks.html page. Each task is a <li><p> whose
 * first link, wrapped in <strong>, is "Task N: <title>" pointing at that
 * task's own (independently hosted) site; organizer names follow a <br>
 * in the same <p>.
 */
function parseTasks($: CheerioAPI, tasksUrl: string): SemevalTask[] {
  const tasks: SemevalTask[] = [];

  $("li > p > strong > a").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    const match = text.match(/^Task\s+(\d+):\s*(.+)$/i);
    if (!match) return;

    const number = Number(match[1]);
    const title = match[2].trim();
    const href = normalizeUrl($el.attr("href") ?? "", tasksUrl);

    const pEl = $el.closest("p");
    const contents = pEl.contents().toArray();
    const brIndex = contents.findIndex((node) => $(node).is("br"));
    let organizers: string | undefined;
    if (brIndex >= 0) {
      organizers = contents
        .slice(brIndex + 1)
        .map((node) => $(node).text())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!organizers) organizers = undefined;
    }

    tasks.push({ number, title, href, organizers });
  });

  return tasks;
}

export const semevalAdapter: ChallengeSourceAdapter = {
  sourceId: "semeval",
  venueSlug: "semeval",

  async discoverEditions(): Promise<SourceEditionCandidate[]> {
    const result = await fetchHtml(HOMEPAGE_URL);
    if (!result.ok) return [];

    const $ = cheerio.load(result.html);
    const links = extractAllLinks($, HOMEPAGE_URL);

    const editionRe = /\/SemEval(\d{4})\/?$/i;
    const editions = new Map<number, string>();

    for (const link of links) {
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        continue;
      }
      // Restrict to the current GitHub Pages naming convention; older
      // editions (e.g. SemEval-2020 on alt.qcri.org) use a different site
      // entirely and aren't handled by this adapter's parsing logic.
      if (url.hostname !== "semeval.github.io") continue;

      const match = url.pathname.match(editionRe);
      if (!match) continue;

      const year = Number(match[1]);
      if (!editions.has(year)) editions.set(year, link.href);
    }

    return Array.from(editions.entries())
      .map(([year, url]) => ({ year, url }))
      .sort((a, b) => a.year - b.year);
  },

  async fetchChallenges(edition: SourceEditionCandidate): Promise<ScrapedChallenge[]> {
    const yearBaseUrl = edition.url.endsWith("/") ? edition.url : `${edition.url}/`;
    // Resolved explicitly against a slash-terminated base — resolving
    // against a bare "…/SemEval2025" would replace the last path segment
    // instead of appending to it.
    const tasksUrl = new URL("tasks.html", yearBaseUrl).toString();

    const tasksResult = await fetchHtml(tasksUrl);
    if (!tasksResult.ok) return [];

    const $tasks = cheerio.load(tasksResult.html);
    const tasks = parseTasks($tasks, tasksUrl);
    if (tasks.length === 0) return [];

    let sharedDateFields: Partial<Record<DateFieldName, ParsedDate>> = {};
    const indexResult = await fetchHtml(yearBaseUrl);
    if (indexResult.ok) {
      const $index = cheerio.load(indexResult.html);
      let heading = $index("h2, h3, h4")
        .filter((_, el) => /important dates for task participants/i.test($index(el).text()))
        .first();
      if (!heading.length) {
        heading = $index("h2, h3, h4").filter((_, el) => /important dates/i.test($index(el).text())).first();
      }
      const ul = heading.nextAll("ul").first();
      if (ul.length) {
        const rows = extractSemevalTimelineRows($index, ul);
        sharedDateFields = buildTimelineDateFields(rows);
      }
    }

    return tasks.map((task) => {
      const hostPlatform = detectHostPlatform([{ text: task.title, href: task.href }]);

      const challenge: ScrapedChallenge = {
        externalKey: `semeval-${edition.year}-task-${task.number}`,
        name: `SemEval-${edition.year} Task ${task.number}: ${task.title}`,
        venueSlug: "semeval",
        venueYear: edition.year,
        officialUrl: task.href,
        sourceUrl: tasksUrl,
        description: task.organizers ? `Organizers: ${task.organizers}` : undefined,
        hostPlatform,
        domains: inferDomains(task.title),
        links: [{ label: "Official task site", type: "official", url: task.href }],
        ...sharedDateFields,
      };

      return challenge;
    });
  },
};
