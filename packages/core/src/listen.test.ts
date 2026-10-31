import { describe, expect, it, vi } from "vitest";
import {
  type RecognitionLike,
  browserRecognizer,
  createListener,
  describeListenError,
  toListenError,
} from "./listen";

class FakeRecognition implements RecognitionLike {
  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  started = false;
  start = vi.fn(() => void (this.started = true));
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => {
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  });
  say(parts: { text: string; final: boolean }[]) {
    this.onresult?.({
      resultIndex: 0,
      results: parts.map((p) => ({
        isFinal: p.final,
        0: { transcript: p.text },
      })),
    });
  }
}

function setup() {
  const rec = new FakeRecognition();
  const events = {
    states: [] as string[],
    transcripts: [] as [string, boolean][],
    heard: [] as string[],
    errors: [] as string[],
  };
  const listener = createListener(() => rec, {
    onState: (s) => events.states.push(s),
    onTranscript: (t, f) => events.transcripts.push([t, f]),
    onHeard: (t) => events.heard.push(t),
    onError: (e) => events.errors.push(e),
  });
  return { rec, listener, events };
}

describe("createListener", () => {
  it("configures a single-shot recognizer and reports interim then final text", () => {
    const { rec, listener, events } = setup();
    listener.start();
    expect(rec).toMatchObject({
      lang: "en-US",
      interimResults: true,
      continuous: false,
      started: true,
    });
    expect(listener.state).toBe("listening");
    rec.say([{ text: "how much do", final: false }]);
    rec.say([{ text: "how much do I owe", final: true }]);
    expect(events.transcripts).toEqual([
      ["how much do", false],
      ["how much do I owe", true],
    ]);
    rec.onend?.();
    expect(events.heard).toEqual(["how much do I owe"]);
    expect(events.states).toEqual(["listening", "idle"]);
  });

  it("joins several result segments", () => {
    const { rec, listener, events } = setup();
    listener.start();
    rec.say([
      { text: "what is ", final: true },
      { text: "the deadline", final: true },
    ]);
    rec.onend?.();
    expect(events.heard).toEqual(["what is the deadline"]);
  });

  it("stop keeps what was heard; cancel discards it silently", () => {
    const a = setup();
    a.listener.start();
    a.rec.say([{ text: "keep this", final: true }]);
    a.listener.stop();
    expect(a.events.heard).toEqual(["keep this"]);

    const b = setup();
    b.listener.start();
    b.rec.say([{ text: "drop this", final: true }]);
    b.listener.cancel();
    expect(b.events.heard).toEqual([]);
    expect(b.events.errors).toEqual([]);
    expect(b.listener.state).toBe("idle");
  });

  it("reports errors with a code and does not treat partial text as a question", () => {
    const { rec, listener, events } = setup();
    listener.start();
    rec.say([{ text: "half a", final: false }]);
    rec.onerror?.({ error: "not-allowed" });
    rec.onend?.();
    expect(events.errors).toEqual(["not-allowed"]);
    expect(events.heard).toEqual([]);
  });

  it("says nothing heard rather than inventing a question", () => {
    const { rec, listener, events } = setup();
    listener.start();
    rec.onend?.();
    expect(events.heard).toEqual([]);
  });

  it("reports unsupported when there is no recognizer, and ignores a second start", () => {
    const events: string[] = [];
    createListener(() => null, { onError: (e) => events.push(e) }).start();
    expect(events).toEqual(["unsupported"]);
    const { rec, listener } = setup();
    listener.start();
    listener.start();
    expect(rec.start).toHaveBeenCalledOnce();
  });

  it("recovers if start throws", () => {
    const rec = new FakeRecognition();
    rec.start = vi.fn(() => {
      throw new Error("already started");
    });
    const errors: string[] = [];
    const listener = createListener(() => rec, {
      onError: (e) => errors.push(e),
    });
    listener.start();
    expect(errors).toEqual(["other"]);
    expect(listener.state).toBe("idle");
  });
});

describe("error messages", () => {
  it("maps browser codes and always offers typing as the way out", () => {
    expect(toListenError("service-not-allowed")).toBe("not-allowed");
    expect(toListenError("no-speech")).toBe("no-speech");
    expect(toListenError("language-not-supported")).toBe("other");
    for (const e of [
      "not-allowed",
      "no-speech",
      "audio-capture",
      "network",
      "unsupported",
      "other",
    ] as const) {
      expect(describeListenError(e)).toMatch(/type your question/);
    }
  });

  it("finds the browser constructor, prefixed or not", () => {
    expect(browserRecognizer({})).toBeNull();
    expect(
      browserRecognizer({ webkitSpeechRecognition: FakeRecognition })?.(),
    ).toBeInstanceOf(FakeRecognition);
    expect(
      browserRecognizer({ SpeechRecognition: FakeRecognition })?.(),
    ).toBeInstanceOf(FakeRecognition);
  });
});
