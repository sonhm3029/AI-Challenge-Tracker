import type { ChallengeLinkType } from "@/db/schema";
import type { DiscoveredLink } from "@/lib/scraping/extractLinks";
import { getRegistrableDomain } from "@/lib/scraping/normalizeUrl";

const PLATFORM_DOMAINS: { domain: string; hostPlatform: string; linkType: ChallengeLinkType }[] = [
  { domain: "codabench.org", hostPlatform: "Codabench", linkType: "platform" },
  { domain: "kaggle.com", hostPlatform: "Kaggle", linkType: "platform" },
  { domain: "eval.ai", hostPlatform: "EvalAI", linkType: "platform" },
  { domain: "grand-challenge.org", hostPlatform: "Grand-Challenge.org", linkType: "platform" },
  { domain: "codalab.org", hostPlatform: "CodaLab", linkType: "platform" },
  { domain: "huggingface.co", hostPlatform: "Hugging Face", linkType: "platform" },
];

export type DetectedPlatformLink = {
  link: DiscoveredLink;
  linkType: ChallengeLinkType;
  hostPlatform?: string;
};

/**
 * Classifies discovered links into challenge_links.link_type values
 * (Section 9.5) and, where the domain identifies a known hosting platform,
 * a hostPlatform label for the challenge record.
 */
export function detectPlatformLinks(links: DiscoveredLink[]): DetectedPlatformLink[] {
  return links.map((link) => {
    const domain = getRegistrableDomain(link.href);
    const platform = PLATFORM_DOMAINS.find((p) => domain === p.domain || domain.endsWith(`.${p.domain}`));
    if (platform) {
      return { link, linkType: platform.linkType, hostPlatform: platform.hostPlatform };
    }
    if (domain === "github.com") return { link, linkType: "github" };
    const text = link.text.toLowerCase();
    if (/dataset|data\b/.test(text)) return { link, linkType: "dataset" };
    if (/leaderboard|ranking/.test(text)) return { link, linkType: "leaderboard" };
    if (/rule/.test(text)) return { link, linkType: "rules" };
    if (/registra/.test(text)) return { link, linkType: "registration" };
    if (/workshop/.test(text)) return { link, linkType: "workshop" };
    return { link, linkType: "other" };
  });
}

export function detectHostPlatform(links: DiscoveredLink[]): string | undefined {
  return detectPlatformLinks(links).find((d) => d.hostPlatform)?.hostPlatform;
}
