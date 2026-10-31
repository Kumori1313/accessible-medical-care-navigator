// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReadAloud } from "./ReadAloud";

/** Regression: with no `engine` prop, speech must survive the re-render that "speaking" causes. */
afterEach(() => {
  vi.unstubAllGlobals();
});

it("keeps speaking after pressing Read aloud when using the browser's own speech engine", async () => {
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [],
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(public text: string) {}
    },
  );
  Object.defineProperty(window, "speechSynthesis", {
    value: synth,
    configurable: true,
  });

  render(
    <ReadAloud
      chunks={["One.", "Two."]}
      rate={1}
      voiceURI=""
      onChange={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Read aloud" }));

  expect(synth.speak).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  // play() cancels once to clear the queue; a rebuilt reader would cancel again and cut the speech off.
  expect(synth.cancel).toHaveBeenCalledTimes(1);
});
