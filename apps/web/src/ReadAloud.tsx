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

interface Engine extends SynthLike {
  getVoices(): VoiceLike[];
  addEventListener?(type: "voiceschanged", cb: () => void): void;
  removeEventListener?(type: "voiceschanged", cb: () => void): void;
}

function browserEngine(): {
  synth: Engine;
  make: (t: string) => Utterance;
} | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window))
    return null;
  return {
    synth: window.speechSynthesis as unknown as Engine,
    make: (t) => new SpeechSynthesisUtterance(t) as unknown as Utterance,
  };
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
  engine = browserEngine(),
}: {
  chunks: string[];
  engine?: { synth: Engine; make: (t: string) => Utterance } | null;
}) {
  const [state, setState] = useState<ReaderState>("idle");
  const [message, setMessage] = useState("");
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const reader = useRef<Reader | null>(null);

  useEffect(() => {
    if (!engine) return;
    const r = createReader(engine.synth, engine.make, (s) => {
      setState(s);
      setMessage(MESSAGES[s]);
    });
    reader.current = r;
    const load = () => setVoices(engine.synth.getVoices());
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
          onChange={(e) => setRate(Number(e.target.value))}
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
              onChange={(e) => setVoiceURI(e.target.value)}
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
