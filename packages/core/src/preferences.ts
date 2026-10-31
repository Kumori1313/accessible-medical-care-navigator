/** User-controlled display and interaction preferences, set during onboarding. */
export interface AccessPreferences {
  /** Root font scale multiplier (1 = browser default). */
  fontScale: number;
  theme: "system" | "light" | "dark" | "high-contrast";
  dyslexiaFont: boolean;
  reducedMotion: boolean;
}

export const defaultPreferences: AccessPreferences = {
  fontScale: 1,
  theme: "system",
  dyslexiaFont: false,
  reducedMotion: false,
};

export function normalizePreferences(input: Partial<AccessPreferences>): AccessPreferences {
  const merged = { ...defaultPreferences, ...input };
  return { ...merged, fontScale: Math.min(3, Math.max(0.75, merged.fontScale)) };
}
