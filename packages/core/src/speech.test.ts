import { describe, expect, it, vi } from "vitest";
import type { Explanation } from "./api";
import {
  SPOKEN_DISCLAIMER,
  chunkText,
  createReader,
  explanationToSpeech,
  type Utterance,
} from "./speech";

const explanation: Explanation = {
  document_type: "Intake form",
  summary: "Collects patient details",
  sections: [
    {
      title: "Medications",
      what_it_asks: "List what you take",
      required: true,
      quote: "",
    },
    {
      title: "Notes",
      what_it_asks: "Anything else",
      required: false,
      quote: "",
    },
    {
      title: "Signature",
      what_it_asks: "Sign here",
      required: null,
      quote: "",
    },
  ],
  uncertain: ["The top corner"],
};

describe("chunkText", () => {
  it("keeps short text whole and splits long text on sentence boundaries", () => {
    expect(chunkText("One. Two.")).toEqual(["One. Two."]);
    const long = Array.from(
      { length: 10 },
      (_, i) => `Sentence number ${i} is here.`,
    ).join(" ");
    const chunks = chunkText(long, 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
    expect(chunks.join(" ")).toBe(long);
  });
  it("hard-splits a single sentence longer than the limit", () => {
    expect(chunkText("a".repeat(500), 200).every((c) => c.length <= 200)).toBe(
      true,
    );
  });
  it("returns nothing for empty text", () => {
    expect(chunkText("  ")).toEqual([]);
  });
});

describe("explanationToSpeech", () => {
  const spoken = explanationToSpeech(explanation).join(" ");
  it("leads with the disclaimer", () => {
    expect(spoken.startsWith(SPOKEN_DISCLAIMER)).toBe(true);
  });
  it("reads required/optional and uncertain parts", () => {
    expect(spoken).toContain(
      "Part 1: Medications. List what you take. Required.",
    );
    expect(spoken).toContain("Optional.");
    expect(spoken).toContain("We were unsure about: The top corner.");
    expect(spoken).not.toContain("Signature. Sign here. Required");
  });
});

describe("createReader", () => {
  function setup() {
    const spoken: Utterance[] = [];
    const synth = {
      speak: vi.fn((u: Utterance) => spoken.push(u)),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const states: string[] = [];
    const reader = createReader(
      synth,
      (text) => ({ text, rate: 1, voice: null, onend: null, onerror: null }),
      (s) => states.push(s),
    );
    return { synth, spoken, states, reader };
  }

  it("does nothing until play, then queues every chunk and returns to idle after the last", () => {
    const { spoken, states, reader } = setup();
    expect(states).toEqual([]);
    reader.play(["a", "b"], { rate: 1.5 });
    expect(spoken.map((u) => [u.text, u.rate])).toEqual([
      ["a", 1.5],
      ["b", 1.5],
    ]);
    spoken[0]!.onend?.();
    expect(reader.state).toBe("speaking");
    spoken[1]!.onend?.();
    expect(reader.state).toBe("idle");
  });
  it("pauses and resumes only from valid states", () => {
    const { synth, reader } = setup();
    reader.pause();
    expect(synth.pause).not.toHaveBeenCalled();
    reader.play(["a"]);
    reader.pause();
    expect(reader.state).toBe("paused");
    reader.resume();
    expect(reader.state).toBe("speaking");
  });
  it("ignores late events from a cancelled run", () => {
    const { spoken, reader } = setup();
    reader.play(["old"]);
    const old = spoken[0]!;
    reader.play(["new"]);
    old.onend?.();
    expect(reader.state).toBe("speaking");
    reader.stop();
    expect(reader.state).toBe("idle");
  });
  it("returns to idle on a real engine error but not on cancel", () => {
    const { spoken, reader } = setup();
    reader.play(["a"]);
    spoken[0]!.onerror?.({ error: "canceled" });
    expect(reader.state).toBe("speaking");
    spoken[0]!.onerror?.({ error: "synthesis-failed" });
    expect(reader.state).toBe("idle");
  });
});
