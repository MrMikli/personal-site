import { makeHeatSlug, parseHeatSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  test("lowercases and hyphenates", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  test("removes diacritics", () => {
    expect(slugify("Crème brûlée")).toBe("creme-brulee");
  });

  test("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
  });
});

describe("heat slug helpers", () => {
  test("makeHeatSlug uses default heat name", () => {
    const slug = makeHeatSlug({ gauntletName: "My Gauntlet", heatName: "", heatOrder: 2 });
    expect(slug).toBe("my-gauntlet--heat-2--2");
  });

  test("parseHeatSlug round-trips order", () => {
    const slug = makeHeatSlug({ gauntletName: "My Gauntlet", heatName: "Heat One", heatOrder: 1 });
    expect(parseHeatSlug(slug)).toEqual({ gauntletSlug: "my-gauntlet", heatSlug: "heat-one", order: 1 });
  });

  test("parseHeatSlug rejects invalid values", () => {
    expect(parseHeatSlug("")).toBeNull();
    expect(parseHeatSlug("nope")).toBeNull();
    expect(parseHeatSlug("g--h--0")).toBeNull();
    expect(parseHeatSlug("--h--1")).toBeNull();
  });
});
