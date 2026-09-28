import { describe, expect, it } from "vitest";
import { parseHumanDate } from "@/lib/scraping/parseDates";

describe("parseHumanDate", () => {
  it("parses ISO date-only strings without inventing a time", () => {
    const parsed = parseHumanDate("2027-02-05");
    expect(parsed.precision).toBe("date");
    expect(parsed.value?.toISOString()).toBe("2027-02-05T00:00:00.000Z");
  });

  it("parses 'Month D, YYYY' date-only strings", () => {
    const parsed = parseHumanDate("May 14, 2027");
    expect(parsed.precision).toBe("date");
    expect(parsed.value?.getUTCFullYear()).toBe(2027);
    expect(parsed.value?.getUTCMonth()).toBe(4);
    expect(parsed.value?.getUTCDate()).toBe(14);
  });

  it("parses 'D Month YYYY' date-only strings", () => {
    const parsed = parseHumanDate("14 May 2027");
    expect(parsed.value?.getUTCFullYear()).toBe(2027);
    expect(parsed.value?.getUTCMonth()).toBe(4);
  });

  it("resolves AoE to Etc/GMT+12 and preserves the original label", () => {
    const parsed = parseHumanDate("February 5, 2027, 23:59 AoE");
    expect(parsed.timezone).toBe("AoE");
    expect(parsed.precision).toBe("minute");
    // Etc/GMT+12 is 12 hours behind UTC, so 23:59 AoE is 11:59 UTC the next day.
    expect(parsed.value?.toISOString()).toBe("2027-02-06T11:59:00.000Z");
  });

  it("resolves UTC explicitly", () => {
    const parsed = parseHumanDate("2027-02-05T23:59:00 UTC");
    expect(parsed.value?.toISOString()).toBe("2027-02-05T23:59:00.000Z");
  });

  it("returns a null value for unparseable garbage without throwing", () => {
    const parsed = parseHumanDate("Sometime soon, TBD");
    expect(parsed.value).toBeNull();
    expect(parsed.originalText).toBe("Sometime soon, TBD");
  });

  it("returns a null value for empty input", () => {
    const parsed = parseHumanDate("");
    expect(parsed.value).toBeNull();
  });
});
