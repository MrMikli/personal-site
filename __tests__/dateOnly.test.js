import { addUtcDaysMs, formatDateOnlyUTC, getUtcDateOnlyParts, getUtcDayBoundsMs } from "@/lib/dateOnly";

describe("dateOnly utils", () => {
  test("getUtcDateOnlyParts returns null for invalid input", () => {
    expect(getUtcDateOnlyParts(null)).toBeNull();
    expect(getUtcDateOnlyParts("not-a-date")).toBeNull();
  });

  test("getUtcDayBoundsMs returns start/end of UTC day", () => {
    const bounds = getUtcDayBoundsMs("2026-02-15T12:34:56Z");
    expect(bounds).toEqual({
      start: Date.UTC(2026, 1, 15, 0, 0, 0, 0),
      end: Date.UTC(2026, 1, 15, 23, 59, 59, 999)
    });
  });

  test("formatDateOnlyUTC returns empty string for invalid input", () => {
    expect(formatDateOnlyUTC("nope")).toBe("");
  });

  test("addUtcDaysMs adds days in ms", () => {
    const start = Date.UTC(2026, 1, 15, 0, 0, 0, 0);
    expect(addUtcDaysMs(start, 2)).toBe(start + 2 * 24 * 60 * 60 * 1000);
  });
});
