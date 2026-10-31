import { type Reader, type ReaderState, createReader } from "@amcn/core";
import { useEffect, useRef, useState } from "react";
import { type SpeechEngine, browserEngine } from "./ReadAloud";

/** Speak short pieces of text on request. Nothing is ever spoken unless `speak` is called. */
export function useSpeaker(engineProp?: SpeechEngine | null) {
  // Created once, so a new engine object per render cannot rebuild the reader mid-speech.
  const [browserDefault] = useState(browserEngine);
  const engine = engineProp === undefined ? browserDefault : engineProp;
  const [state, setState] = useState<ReaderState>("idle");
  const reader = useRef<Reader | null>(null);

  useEffect(() => {
    if (!engine) return;
    const r = createReader(engine.synth, engine.make, setState);
    reader.current = r;
    return () => r.stop();
  }, [engine]);

  return {
    supported: engine !== null,
    state,
    speak(chunks: string[], rate: number, voiceURI: string) {
      const voice = engine?.synth
        .getVoices()
        .find((v) => v.voiceURI === voiceURI);
      reader.current?.play(chunks, { rate, voice });
    },
    stop() {
      reader.current?.stop();
    },
  };
}
