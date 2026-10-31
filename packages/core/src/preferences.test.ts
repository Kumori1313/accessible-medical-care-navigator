import { describe, expect, it } from "vitest";
import { defaultPreferences, normalizePreferences } from "./preferences";

describe("normalizePreferences", () => {
  it("fills in defaults", () => {
    expect(normalizePreferences({})).toEqual(defaultPreferences);
  });
  it("clamps font scale", () => {
    expect(normalizePreferences({ fontScale: 10 }).fontScale).toBe(3);
    expect(normalizePreferences({ fontScale: 0.1 }).fontScale).toBe(0.75);
  });
});
