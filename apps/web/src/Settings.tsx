import {
  type AccessPreferences,
  FONT_SCALES,
  type ReadingLevel,
  type Spacing,
  type Theme,
} from "@amcn/core";
import { Button } from "@amcn/ui";
import { useEffect, useRef } from "react";

const SCALE_LABELS: Record<number, string> = {
  1: "Standard",
  1.25: "Large",
  1.5: "Larger",
  2: "Largest",
};

export function Settings({
  value,
  onChange,
  onDone,
  saved,
}: {
  value: AccessPreferences;
  onChange: (p: AccessPreferences) => void;
  onDone: () => void;
  /** False when the browser would not let us store preferences. */
  saved: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const set = <K extends keyof AccessPreferences>(
    key: K,
    v: AccessPreferences[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <section aria-labelledby="h-settings">
      <h1 id="h-settings" ref={heading} tabIndex={-1}>
        Settings
      </h1>
      {!saved && (
        <p role="note">
          Your browser is not letting us save settings, so they will reset when
          you close this page.
        </p>
      )}

      <fieldset className="amcn-fieldset">
        <legend>Reading</legend>
        <p>
          <label htmlFor="s-scale">Text size </label>
          <select
            id="s-scale"
            value={value.fontScale}
            onChange={(e) => set("fontScale", Number(e.target.value))}
          >
            {(FONT_SCALES.includes(value.fontScale as never)
              ? [...FONT_SCALES]
              : [value.fontScale, ...FONT_SCALES]
            ).map((s) => (
              <option key={s} value={s}>
                {SCALE_LABELS[s] ?? `${Math.round(s * 100)}%`}
              </option>
            ))}
          </select>
        </p>
        <p>
          <label htmlFor="s-theme">Colors </label>
          <select
            id="s-theme"
            value={value.theme}
            onChange={(e) => set("theme", e.target.value as Theme)}
          >
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </p>
        <p>
          <label htmlFor="s-spacing">Spacing between lines and letters </label>
          <select
            id="s-spacing"
            value={value.spacing}
            onChange={(e) => set("spacing", e.target.value as Spacing)}
          >
            <option value="normal">Normal</option>
            <option value="relaxed">Roomy</option>
            <option value="wide">Extra roomy</option>
          </select>
        </p>
        <label>
          <input
            type="checkbox"
            checked={value.dyslexiaFont}
            onChange={(e) => set("dyslexiaFont", e.target.checked)}
          />
          Use a dyslexia-friendly font
        </label>
        <p>
          <label htmlFor="s-level">Explanation reading level </label>
          <select
            id="s-level"
            value={value.readingLevel}
            onChange={(e) =>
              set("readingLevel", e.target.value as ReadingLevel)
            }
          >
            <option value="simple">Simple</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </p>
      </fieldset>

      <fieldset className="amcn-fieldset">
        <legend>Movement and touch</legend>
        <label>
          <input
            type="checkbox"
            checked={value.reducedMotion}
            onChange={(e) => set("reducedMotion", e.target.checked)}
          />
          Turn off animation
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.oneHanded}
            onChange={(e) => set("oneHanded", e.target.checked)}
          />
          One-handed layout (bigger buttons near the bottom)
        </label>
      </fieldset>

      <p>
        Reading speed and voice for Read aloud are on the explanation page and
        are remembered too.
      </p>
      <div className="amcn-actions">
        <Button onPress={onDone}>Done</Button>
      </div>
    </section>
  );
}
