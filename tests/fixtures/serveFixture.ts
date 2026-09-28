import { readFileSync } from "node:fs";
import { vi } from "vitest";

/**
 * Stubs global fetch so adapter tests run entirely off local HTML fixtures
 * (Section 44: "Tests must not rely only on live websites"). `routes` maps
 * a URL (exact match or substring) to a fixture file path.
 */
export function stubFetchWithFixtures(routes: { match: string; fixturePath: string; status?: number }[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      return new Response("", { status: 404 });
    }
    const html = readFileSync(route.fixturePath, "utf-8");
    return new Response(html, { status: route.status ?? 200, headers: { "content-type": "text/html" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
