import { describe, expect, it } from "vitest";
import {
  type StyleTarget,
  applyPreferences,
  createPreferencesStore,
  defaultPreferences,
  noNeeds,
  normalizePreferences,
  preferencesFromNeeds,
} from "./preferences";

describe("normalizePreferences", () => {
  it("fills in defaults", () => {
    expect(normalizePreferences({})).toEqual(defaultPreferences);
    expect(normalizePreferences()).toEqual(defaultPreferences);
  });
  it("clamps numbers and rejects invalid values", () => {
    expect(normalizePreferences({ fontScale: 10 }).fontScale).toBe(3);
    expect(normalizePreferences({ fontScale: 0.1 }).fontScale).toBe(0.75);
    expect(normalizePreferences({ speechRate: Number.NaN }).speechRate).toBe(1);
    const bad = normalizePreferences({
      theme: "neon",
      spacing: 3,
      dyslexiaFont: "yes",
      readingLevel: "x",
    });
    expect(bad).toEqual(defaultPreferences);
  });
});

describe("preferencesFromNeeds", () => {
  it("gives defaults when nothing is selected", () => {
    expect(preferencesFromNeeds(noNeeds)).toEqual(defaultPreferences);
  });
  it("combines presets", () => {
    const p = preferencesFromNeeds({
      ...noNeeds,
      lowVision: true,
      readingDifficulty: true,
    });
    expect(p).toMatchObject({
      fontScale: 1.5,
      theme: "high-contrast",
      dyslexiaFont: true,
      spacing: "wide",
      readingLevel: "simple",
    });
    expect(p.reducedMotion).toBe(false);
  });
});

describe("applyPreferences", () => {
  const target = (): StyleTarget & { vars: Record<string, string> } => {
    const vars: Record<string, string> = {};
    return {
      vars,
      dataset: {},
      style: { setProperty: (k, v) => void (vars[k] = v) },
    };
  };
  it("sets attributes only for non-default options and clears them again", () => {
    const t = target();
    applyPreferences(
      normalizePreferences({ theme: "dark", oneHanded: true, fontScale: 1.5 }),
      t,
    );
    expect(t.vars["--amcn-font-scale"]).toBe("1.5");
    expect(t.dataset).toEqual({ theme: "dark", oneHanded: "true" });
    applyPreferences(defaultPreferences, t);
    expect(t.dataset).toEqual({});
  });
});

describe("createPreferencesStore", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
  };
  it("is not onboarded on first run, then round-trips", () => {
    const store = createPreferencesStore(memory());
    expect(store.load().onboarded).toBe(false);
    const prefs = normalizePreferences({ theme: "dark", fontScale: 1.25 });
    expect(store.save(prefs)).toBe(true);
    expect(store.load()).toEqual({ preferences: prefs, onboarded: true });
  });
  it("survives corrupt data and throwing storage", () => {
    const corrupt = { getItem: () => "{nope", setItem: () => {} };
    expect(createPreferencesStore(corrupt).load().preferences).toEqual(
      defaultPreferences,
    );
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createPreferencesStore(throwing);
    expect(store.load().onboarded).toBe(false);
    expect(store.save(defaultPreferences)).toBe(false);
  });
});
