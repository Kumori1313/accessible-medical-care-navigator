import {
  type Reader,
  type ReaderState,
  type SynthLike,
  type Utterance,
  createReader,
} from "@amcn/core";
import { Button, StatusMessage } from "@amcn/ui";
import { useEffect, useRef, useState } from "react";

export interface VoiceLike {
  voiceURI: string;
  name: string;
  lang: string;
}

export interface Engine extends SynthLike {
  getVoices(): VoiceLike[];
  addEventListener?(type: "voiceschanged", cb: () => void): void;
  removeEventListener?(type: "voiceschanged", cb: () => void): void;
}

export type SpeechEngine = {
  synth: Engine;
  make: (t: string) => Utterance;
};

export function browserEngine(): SpeechEngine | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null;
  return {
    synth: window.speechSynthesis as unknown as Engine,
    make: (t) => new SpeechSynthesisUtterance(t) as unknown as Utterance,
  };
}

function sameVoices(a: VoiceLike[], b: VoiceLike[]): boolean {
  return (
    a.length === b.length && a.every((v, i) => v.voiceURI === b[i]?.voiceURI)
  );
}

const SPEEDS = [
  { value: 0.75, label: "Slow" },
  { value: 1, label: "Normal" },
  { value: 1.25, label: "Fast" },
  { value: 1.5, label: "Very fast" },
];

const MESSAGES: Record<ReaderState, string> = {
  idle: "",
  speaking: "Reading aloud.",
  paused: "Paused.",
};

/** Read-aloud controls. Never starts by itself; screen reader users keep using their own reader. */
export function ReadAloud({
  chunks,
  rate,
  voiceURI,
  onChange,
  engine: engineProp,
}: {
  chunks: string[];
  /** Speed and voice are owned by the saved preferences. */
  rate: number;
  voiceURI: string;
  onChange: (v: { rate: number; voiceURI: string }) => void;
  engine?: { synth: Engine; make: (t: string) => Utterance } | null;
}) {
  // Created once: a new engine object on every render would rebuild the reader (cancelling any
  // speech in progress) and re-run the effect below forever.
  const [browserDefault] = useState(browserEngine);
  const engine = engineProp === undefined ? browserDefault : engineProp;
  const [state, setState] = useState<ReaderState>("idle");
  const [message, setMessage] = useState("");
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const reader = useRef<Reader | null>(null);

  useEffect(() => {
    if (!engine) return;
    const r = createReader(engine.synth, engine.make, (s) => {
      setState(s);
      setMessage(MESSAGES[s]);
    });
    reader.current = r;
    const load = () => {
      const next = engine.synth.getVoices();
      // getVoices() returns a fresh array each call; only update state when the list really changed.
      setVoices((prev) => (sameVoices(prev, next) ? prev : next));
    };
    load();
    engine.synth.addEventListener?.("voiceschanged", load);
    return () => {
      engine.synth.removeEventListener?.("voiceschanged", load);
      r.stop();
    };
  }, [engine]);

  if (!engine) {
    return (
      <p>
        Read aloud is not available in this browser. You can still use your
        device's screen reader.
      </p>
    );
  }

  const play = () => {
    const voice = voices.find((v) => v.voiceURI === voiceURI);
    reader.current?.play(chunks, { rate, voice });
  };

  return (
    <section aria-labelledby="h-read-aloud">
      <h2 id="h-read-aloud">Listen</h2>
      <p>
        {state === "idle" && <Button onPress={play}>Read aloud</Button>}
        {state === "speaking" && (
          <Button onPress={() => reader.current?.pause()}>Pause</Button>
        )}
        {state === "paused" && (
          <Button onPress={() => reader.current?.resume()}>Resume</Button>
        )}{" "}
        {state !== "idle" && (
          <Button onPress={() => reader.current?.stop()}>Stop</Button>
        )}
      </p>
      <p>
        <label htmlFor="tts-speed">Speed </label>
        <select
          id="tts-speed"
          value={rate}
          onChange={(e) => onChange({ rate: Number(e.target.value), voiceURI })}
        >
          {SPEEDS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {voices.length > 1 && (
          <>
            {" "}
            <label htmlFor="tts-voice">Voice </label>
            <select
              id="tts-voice"
              value={voiceURI}
              onChange={(e) => onChange({ rate, voiceURI: e.target.value })}
            >
              <option value="">Default</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </>
        )}
      </p>
      <p>Speed and voice apply the next time you press Read aloud.</p>
      <StatusMessage>{message}</StatusMessage>
    </section>
  );
}
