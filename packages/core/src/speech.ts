import type { Explanation } from "./api";

/** Spoken before every explanation so the audio carries the same caution as the screen. */
export const SPOKEN_DISCLAIMER =
  "This explanation is automatic and can contain mistakes. Check it with the clinic. It is not medical advice.";

/** Long utterances get cut off by some engines (notably Chrome), so speak in short chunks. */
const MAX_CHUNK = 220;

export function chunkText(text: string, max = MAX_CHUNK): string[] {
  const sentences =
    text
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?]+[.!?]*\s*/g) ?? [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push();
      for (let i = 0; i < sentence.length; i += max)
        chunks.push(sentence.slice(i, i + max).trim());
    } else if ((current + sentence).length > max) {
      push();
      current = sentence;
    } else {
      current += sentence;
    }
  }
  push();
  return chunks.filter(Boolean);
}

const ensureStop = (s: string) =>
  /[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;

export function explanationToSpeech(e: Explanation): string[] {
  const parts = [
    SPOKEN_DISCLAIMER,
    ensureStop(e.document_type),
    ensureStop(e.summary),
  ];
  e.sections.forEach((s, i) => {
    const needed =
      s.required === true
        ? " Required."
        : s.required === false
          ? " Optional."
          : "";
    parts.push(
      `Part ${i + 1}: ${ensureStop(s.title)} ${ensureStop(s.what_it_asks)}${needed}`,
    );
  });
  if (e.uncertain.length) {
    parts.push(
      `We were unsure about: ${e.uncertain.map(ensureStop).join(" ")}`,
    );
  }
  return parts.flatMap((p) => chunkText(p));
}

export type ReaderState = "idle" | "speaking" | "paused";

export interface Utterance {
  text: string;
  rate: number;
  voice: unknown;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

export interface SynthLike {
  speak(u: Utterance): void;
  cancel(): void;
  pause(): void;
  resume(): void;
}

export interface Reader {
  play(chunks: string[], options?: { rate?: number; voice?: unknown }): void;
  pause(): void;
  resume(): void;
  stop(): void;
  readonly state: ReaderState;
}

/** Thin state machine over speechSynthesis. Never starts on its own; the user must press play. */
export function createReader(
  synth: SynthLike,
  makeUtterance: (text: string) => Utterance,
  onState: (s: ReaderState) => void = () => {},
): Reader {
  let state: ReaderState = "idle";
  let run = 0; // invalidates callbacks from a cancelled run
  const set = (s: ReaderState) => {
    state = s;
    onState(s);
  };

  return {
    get state() {
      return state;
    },
    play(chunks, { rate = 1, voice } = {}) {
      synth.cancel();
      const id = ++run;
      if (chunks.length === 0) return set("idle");
      chunks.forEach((text, i) => {
        const u = makeUtterance(text);
        u.rate = rate;
        u.voice = voice ?? null;
        u.onend = () => {
          if (id === run && i === chunks.length - 1) set("idle");
        };
        u.onerror = (e) => {
          // "canceled"/"interrupted" are our own stop() or a newer play(); anything else ends playback.
          if (id === run && e.error !== "canceled" && e.error !== "interrupted")
            set("idle");
        };
        synth.speak(u);
      });
      set("speaking");
    },
    pause() {
      if (state !== "speaking") return;
      synth.pause();
      set("paused");
    },
    resume() {
      if (state !== "paused") return;
      synth.resume();
      set("speaking");
    },
    stop() {
      run++;
      synth.cancel();
      set("idle");
    },
  };
}
