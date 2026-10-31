// @vitest-environment jsdom
import type { Utterance } from "@amcn/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { ReadAloud } from "./ReadAloud";

function fakeEngine() {
  const spoken: Utterance[] = [];
  const synth = {
    speak: vi.fn((u: Utterance) => spoken.push(u)),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [
      { voiceURI: "a", name: "Alice", lang: "en-US" },
      { voiceURI: "b", name: "Bob", lang: "en-GB" },
    ],
  };
  return {
    spoken,
    synth,
    engine: {
      synth,
      make: (text: string): Utterance => ({
        text,
        rate: 1,
        voice: null,
        onend: null,
        onerror: null,
      }),
    },
  };
}

it("does not speak until pressed, then offers pause/stop and announces state", async () => {
  const { engine, spoken, synth } = fakeEngine();
  const { container } = render(
    <ReadAloud chunks={["One.", "Two."]} engine={engine} />,
  );
  expect(spoken).toHaveLength(0);

  await userEvent.selectOptions(screen.getByLabelText("Speed"), "1.5");
  await userEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  expect(spoken.map((u) => u.text)).toEqual(["One.", "Two."]);
  expect(spoken[0]!.rate).toBe(1.5);
  expect(screen.getByRole("status")).toHaveTextContent("Reading aloud.");

  await userEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(synth.pause).toHaveBeenCalled();
  expect(screen.getByRole("status")).toHaveTextContent("Paused.");
  await userEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(
    screen.getByRole("button", { name: "Read aloud" }),
  ).toBeInTheDocument();
  expect((await axe(container)).violations).toEqual([]);
});

it("stops speaking when removed from the page", () => {
  const { engine, synth } = fakeEngine();
  render(<ReadAloud chunks={["One."]} engine={engine} />).unmount();
  expect(synth.cancel).toHaveBeenCalled();
});

it("explains when speech is unavailable", () => {
  render(<ReadAloud chunks={["One."]} engine={null} />);
  expect(screen.getByText(/not available in this browser/)).toBeInTheDocument();
});
