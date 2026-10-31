/** Speech input (the browser's SpeechRecognition) as a small, testable state machine. */

export type ListenState = "idle" | "listening";

export type ListenError =
  | "not-allowed"
  | "no-speech"
  | "audio-capture"
  | "network"
  | "unsupported"
  | "other";

export interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<RecognitionResultLike>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface ListenHandlers {
  onState?: (s: ListenState) => void;
  /** Called as the words come in. `final` is true once the engine is sure of them. */
  onTranscript?: (text: string, final: boolean) => void;
  /** Called once when listening ends with something heard. */
  onHeard?: (text: string) => void;
  onError?: (e: ListenError) => void;
}

export interface Listener {
  start(): void;
  /** Stop and keep what was heard so far. */
  stop(): void;
  /** Stop and throw away what was heard. */
  cancel(): void;
  readonly state: ListenState;
}

const KNOWN: ListenError[] = [
  "not-allowed",
  "no-speech",
  "audio-capture",
  "network",
];

export function toListenError(code: string): ListenError {
  if (code === "service-not-allowed") return "not-allowed";
  return (KNOWN as string[]).includes(code) ? (code as ListenError) : "other";
}

/** Plain-language message for each failure, always pointing to the typed alternative. */
export function describeListenError(e: ListenError): string {
  switch (e) {
    case "not-allowed":
      return "The microphone is blocked. Allow it in your browser settings, or type your question instead.";
    case "no-speech":
      return "I did not hear anything. Try again, or type your question instead.";
    case "audio-capture":
      return "No microphone was found. You can type your question instead.";
    case "network":
      return "Voice input needs an internet connection in this browser. You can type your question instead.";
    case "unsupported":
      return "Voice input is not available in this browser. You can type your question instead.";
    default:
      return "Voice input did not work. You can type your question instead.";
  }
}

/** `make` returns a fresh recognizer, or null where speech input does not exist. */
export function createListener(
  make: () => RecognitionLike | null,
  handlers: ListenHandlers = {},
  lang = "en-US",
): Listener {
  let state: ListenState = "idle";
  let active: RecognitionLike | null = null;
  let heard = "";
  let discard = false;
  let failed = false;

  const set = (s: ListenState) => {
    state = s;
    handlers.onState?.(s);
  };

  return {
    get state() {
      return state;
    },
    start() {
      if (state === "listening") return;
      const rec = make();
      if (!rec) {
        handlers.onError?.("unsupported");
        return;
      }
      heard = "";
      discard = false;
      failed = false;
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let text = "";
        let final = true;
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r) continue;
          text += r[0].transcript;
          if (!r.isFinal) final = false;
        }
        heard = text.trim();
        handlers.onTranscript?.(heard, final);
      };
      rec.onerror = (e) => {
        failed = true;
        // "aborted" is our own cancel(); not worth telling the user about.
        if (e.error !== "aborted") handlers.onError?.(toListenError(e.error));
      };
      rec.onend = () => {
        const text = heard;
        active = null;
        set("idle");
        if (!discard && !failed && text) handlers.onHeard?.(text);
      };
      active = rec;
      try {
        rec.start();
        set("listening");
      } catch {
        active = null;
        handlers.onError?.("other");
      }
    },
    stop() {
      active?.stop();
    },
    cancel() {
      discard = true;
      active?.abort();
    },
  };
}

/** The browser's recognizer constructor, where one exists (Chrome and Safari use a prefix). */
export function browserRecognizer(
  win: unknown,
): (() => RecognitionLike) | null {
  const w = win as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? () => new Ctor() : null;
}
