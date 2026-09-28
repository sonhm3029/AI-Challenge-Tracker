/**
 * Section 13 — URL normalization. Used both when storing links and when
 * matching dedupe candidates by "official domain".
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = "";
    // Strip common tracking params.
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"].forEach((p) =>
      url.searchParams.delete(p),
    );
    let normalized = url.toString();
    if (normalized.endsWith("/") && url.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return rawUrl.trim();
  }
}

export function getRegistrableDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
