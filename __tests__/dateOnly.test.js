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

  test("formatDateOnlyUTC uses a fixed en-US format on the UTC date", () => {
    expect(formatDateOnlyUTC("2026-09-30T23:30:00.000Z")).toBe("Sep 30, 2026");
  });

  test("addUtcDaysMs adds days in ms", () => {
    const start = Date.UTC(2026, 1, 15, 0, 0, 0, 0);
    expect(addUtcDaysMs(start, 2)).toBe(start + 2 * 24 * 60 * 60 * 1000);
  });
});
