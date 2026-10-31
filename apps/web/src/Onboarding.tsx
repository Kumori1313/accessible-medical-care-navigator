import {
  type AccessNeeds,
  type AccessPreferences,
  noNeeds,
  preferencesFromNeeds,
} from "@amcn/core";
import { Button } from "@amcn/ui";
import { useState } from "react";

const QUESTIONS: { key: keyof AccessNeeds; label: string; hint: string }[] = [
  {
    key: "lowVision",
    label: "Small text is hard for me to see",
    hint: "Larger text and a high-contrast look",
  },
  {
    key: "readingDifficulty",
    label: "Reading long text is hard or tiring",
    hint: "Dyslexia-friendly font, wider spacing and simpler explanations",
  },
  {
    key: "motionSensitivity",
    label: "Movement and animation bother me",
    hint: "Turns animation off",
  },
  {
    key: "oneHanded",
    label:
      "I mostly use one hand, or have trouble reaching or pressing small buttons",
    hint: "Bigger buttons, kept near the bottom of the screen",
  },
];

/** First-run questions. Everything chosen here can be changed later in Settings. */
export function Onboarding({
  onPreview,
  onDone,
}: {
  /** Called as answers change so the user sees the effect immediately. */
  onPreview: (p: AccessPreferences) => void;
  onDone: (p: AccessPreferences) => void;
}) {
  const [needs, setNeeds] = useState<AccessNeeds>(noNeeds);

  function toggle(key: keyof AccessNeeds, on: boolean) {
    const next = { ...needs, [key]: on };
    setNeeds(next);
    onPreview(preferencesFromNeeds(next));
  }

  return (
    <section aria-labelledby="h-onboarding">
      <h1 id="h-onboarding">Welcome</h1>
      <p>
        Let's set this up so it works for you. Choose anything that applies, or
        skip. You can change everything later in Settings.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onDone(preferencesFromNeeds(needs));
        }}
      >
        <fieldset className="amcn-fieldset">
          <legend>What would make this easier to use?</legend>
          {QUESTIONS.map((q) => (
            <label key={q.key}>
              <input
                type="checkbox"
                checked={needs[q.key]}
                onChange={(e) => toggle(q.key, e.target.checked)}
              />
              {q.label}
              <br />
              <small>{q.hint}</small>
            </label>
          ))}
        </fieldset>
        <div className="amcn-actions">
          <Button type="submit">Continue</Button>
          <Button onPress={() => onDone(preferencesFromNeeds(noNeeds))}>
            Skip for now
          </Button>
        </div>
      </form>
    </section>
  );
}
