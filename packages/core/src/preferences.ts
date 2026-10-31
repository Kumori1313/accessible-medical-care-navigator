import type { ReadingLevel } from "./api";

export type Theme = "system" | "light" | "dark" | "high-contrast";
export type Spacing = "normal" | "relaxed" | "wide";

/** User-controlled display and interaction preferences. */
export interface AccessPreferences {
  /** Root font scale multiplier (1 = browser default). */
  fontScale: number;
  theme: Theme;
  dyslexiaFont: boolean;
  reducedMotion: boolean;
  spacing: Spacing;
  /** Keeps the main actions within thumb reach and makes targets larger. */
  oneHanded: boolean;
  readingLevel: ReadingLevel;
  /** Text-to-speech rate (0.75 - 1.5) and chosen voice ("" = device default). */
  speechRate: number;
  voiceURI: string;
}

export const defaultPreferences: AccessPreferences = {
  fontScale: 1,
  theme: "system",
  dyslexiaFont: false,
  reducedMotion: false,
  spacing: "normal",
  oneHanded: false,
  readingLevel: "standard",
  speechRate: 1,
  voiceURI: "",
};

export const FONT_SCALES = [1, 1.25, 1.5, 2] as const;
const THEMES: Theme[] = ["system", "light", "dark", "high-contrast"];
const SPACINGS: Spacing[] = ["normal", "relaxed", "wide"];
const LEVELS: ReadingLevel[] = ["simple", "standard", "detailed"];

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;
const oneOf = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Accepts anything (e.g. parsed storage) and always returns a valid, complete preferences object. */
export function normalizePreferences(
  input: Record<string, unknown> = {},
): AccessPreferences {
  const d = defaultPreferences;
  return {
    fontScale: clamp(num(input.fontScale, d.fontScale), 0.75, 3),
    theme: oneOf(input.theme, THEMES, d.theme),
    dyslexiaFont: bool(input.dyslexiaFont, d.dyslexiaFont),
    reducedMotion: bool(input.reducedMotion, d.reducedMotion),
    spacing: oneOf(input.spacing, SPACINGS, d.spacing),
    oneHanded: bool(input.oneHanded, d.oneHanded),
    readingLevel: oneOf(input.readingLevel, LEVELS, d.readingLevel),
    speechRate: clamp(num(input.speechRate, d.speechRate), 0.5, 2),
    voiceURI: typeof input.voiceURI === "string" ? input.voiceURI : d.voiceURI,
  };
}

/** Answers from the onboarding questions. Each maps to a set of preferences the user can still change. */
export interface AccessNeeds {
  lowVision: boolean;
  readingDifficulty: boolean;
  motionSensitivity: boolean;
  oneHanded: boolean;
}

export const noNeeds: AccessNeeds = {
  lowVision: false,
  readingDifficulty: false,
  motionSensitivity: false,
  oneHanded: false,
};

export function preferencesFromNeeds(needs: AccessNeeds): AccessPreferences {
  return normalizePreferences({
    ...(needs.lowVision && { fontScale: 1.5, theme: "high-contrast" }),
    ...(needs.readingDifficulty && {
      dyslexiaFont: true,
      spacing: "wide",
      readingLevel: "simple",
    }),
    ...(needs.motionSensitivity && { reducedMotion: true }),
    ...(needs.oneHanded && { oneHanded: true }),
  });
}

/** The minimal slice of an element we write to, so this works without a DOM in tests. */
export interface StyleTarget {
  dataset: Record<string, string | undefined>;
  style: { setProperty(name: string, value: string): void };
}

export function applyPreferences(
  p: AccessPreferences,
  root: StyleTarget,
): void {
  root.style.setProperty("--amcn-font-scale", String(p.fontScale));
  const set = (key: string, on: boolean, value = "true") => {
    if (on) root.dataset[key] = value;
    else delete root.dataset[key];
  };
  set("theme", p.theme !== "system", p.theme);
  set("font", p.dyslexiaFont, "dyslexia");
  set("reducedMotion", p.reducedMotion);
  set("spacing", p.spacing !== "normal", p.spacing);
  set("oneHanded", p.oneHanded);
}

const KEY = "amcn.preferences.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Loaded {
  preferences: AccessPreferences;
  /** False on first run, so the app can show onboarding. */
  onboarded: boolean;
}

/** Storage can throw (private mode, blocked cookies); preferences then simply don't persist. */
export function createPreferencesStore(storage: StorageLike) {
  return {
    load(): Loaded {
      try {
        const raw = storage.getItem(KEY);
        if (!raw) return { preferences: defaultPreferences, onboarded: false };
        return {
          preferences: normalizePreferences(
            JSON.parse(raw) as Record<string, unknown>,
          ),
          onboarded: true,
        };
      } catch {
        return { preferences: defaultPreferences, onboarded: false };
      }
    },
    save(p: AccessPreferences): boolean {
      try {
        storage.setItem(KEY, JSON.stringify(p));
        return true;
      } catch {
        return false;
      }
    },
  };
}
