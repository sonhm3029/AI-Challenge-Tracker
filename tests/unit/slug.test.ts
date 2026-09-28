import { describe, expect, it } from "vitest";
import { buildChallengeSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("WSDM Cup 2027: Multilingual Retrieval")).toBe("wsdm-cup-2027-multilingual-retrieval");
  });

  it("strips accents", () => {
    expect(slugify("Café Île 2027")).toBe("cafe-ile-2027");
  });
});

describe("buildChallengeSlug", () => {
  it("appends the venue year when not already present in the name", () => {
    expect(buildChallengeSlug("WSDM Cup", 2027)).toBe("wsdm-cup-2027");
  });

  it("does not duplicate the year when already present", () => {
    expect(buildChallengeSlug("WSDM Cup 2027", 2027)).toBe("wsdm-cup-2027");
  });
});
