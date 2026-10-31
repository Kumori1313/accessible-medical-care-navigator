import {
  type Answer,
  type Api,
  ApiError,
  type RecognitionLike,
  answerToSpeech,
  browserRecognizer,
  createListener,
  describeListenError,
  type Listener,
} from "@amcn/core";
import { Button, ErrorMessage, StatusMessage } from "@amcn/ui";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { CannedQuestion } from "./demo/samples";
import type { SpeechEngine } from "./ReadAloud";
import { useSpeaker } from "./useSpeaker";

export interface CannedSet {
  questions: CannedQuestion[];
  lookup: (question: string) => CannedQuestion | undefined;
}

interface Shown {
  answer: Answer;
  question: string;
  /** True for a pre-written sample answer rather than a live one. */
  sample: boolean;
}

/**
 * Ask about the open document in your own words, by typing or (where the browser supports it)
 * by voice. Typing always works. A question asked by voice is answered out loud; a typed one
 * offers a "Read answer aloud" button, so nothing speaks over a screen reader unasked.
 */
export function AskPanel({
  text,
  api,
  canned = null,
  speechRate,
  voiceURI,
  onAnswer,
  recognizer,
  engine,
}: {
  text: string;
  api: Api;
  /** Pre-written questions for built-in samples (they work with no server). */
  canned?: CannedSet | null;
  speechRate: number;
  voiceURI: string;
  /** Tells the page which passage of the original supports the latest answer ("" for none). */
  onAnswer: (quote: string) => void;
  /** Speech input; undefined uses the browser's, null means unavailable. For tests. */
  recognizer?: (() => RecognitionLike) | null;
  engine?: SpeechEngine | null;
}) {
  const [browserRecognizerFn] = useState(() => browserRecognizer(window));
  const make = recognizer === undefined ? browserRecognizerFn : recognizer;
  const speaker = useSpeaker(engine);

  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const listener = useRef<Listener | null>(null);

  async function ask(raw: string, viaVoice: boolean) {
    const q = raw.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    setStatus(
      viaVoice
        ? `I heard: “${q}”. Looking in the document…`
        : "Looking in the document…",
    );
    let result: Shown | null = null;
    const hit = canned?.lookup(q);
    if (hit) {
      result = { answer: hit.answer, question: q, sample: true };
    } else {
      try {
        result = { answer: await api.ask(text, q), question: q, sample: false };
      } catch (e) {
        const reason =
          e instanceof ApiError
            ? e.message
            : "Something went wrong. Please try again.";
        setError(
          canned
            ? `${reason} In sample mode you can pick one of the suggested questions.`
            : reason,
        );
      }
    }
    setBusy(false);
    setStatus("");
    if (!result) {
      onAnswer("");
      return;
    }
    setShown(result);
    onAnswer(result.answer.quote);
    if (viaVoice && speaker.supported) {
      speaker.speak(answerToSpeech(result.answer), speechRate, voiceURI);
    }
  }

  // The listener's callbacks always see the latest props and state without re-creating it.
  const heard = useEffectEvent((spoken: string) => {
    setQuestion(spoken);
    void ask(spoken, true);
  });

  useEffect(() => {
    if (!make) return;
    const l = createListener(make, {
      onState: (s) => {
        setListening(s === "listening");
        setStatus(s === "listening" ? "Listening… ask your question now." : "");
      },
      onTranscript: (t) => setQuestion(t),
      onHeard: (t) => heard(t),
      onError: (e) => setError(describeListenError(e)),
    });
    listener.current = l;
    return () => l.cancel();
  }, [make]);

  function toggleMic() {
    if (listening) {
      listener.current?.stop();
      return;
    }
    speaker.stop(); // do not listen to our own voice
    setError("");
    listener.current?.start();
  }

  const missing = shown && !shown.answer.found;
  const speaking = speaker.state !== "idle";

  return (
    <section aria-labelledby="h-ask">
      <h2 id="h-ask">Ask a question</h2>
      <p id="ask-help">
        Ask in your own words. Answers come only from this document.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question, false);
        }}
      >
        <label htmlFor="ask-q">Your question</label>
        <input
          id="ask-q"
          className="amcn-field"
          type="text"
          value={question}
          maxLength={500}
          aria-describedby="ask-help"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <div className="amcn-actions">
          <Button
            type="submit"
            isDisabled={busy || listening || !question.trim()}
          >
            Ask
          </Button>
          {make && (
            <Button onPress={toggleMic} isDisabled={busy}>
              {listening ? "Stop listening" : "Speak your question"}
            </Button>
          )}
        </div>
      </form>
      {make && (
        <p>
          <small>
            Voice input: your browser may send what you say to its own speech
            service.
          </small>
        </p>
      )}

      {canned && (
        <>
          <p id="ask-try">Try asking:</p>
          <ul className="amcn-samples" aria-labelledby="ask-try">
            {canned.questions.map((c) => (
              <li key={c.question}>
                <Button
                  isDisabled={busy}
                  onPress={() => {
                    setQuestion(c.question);
                    void ask(c.question, false);
                  }}
                >
                  {c.question}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <StatusMessage>{status}</StatusMessage>
      {error && <ErrorMessage>{error}</ErrorMessage>}

      {/* Always mounted so the answer is announced when it appears. */}
      <div
        role="status"
        aria-live="polite"
        className={shown ? "amcn-answer" : undefined}
      >
        {shown && (
          <>
            <h3>{missing ? "Not in this document" : "Answer"}</h3>
            <p>
              <strong>You asked:</strong> {shown.question}
            </p>
            <p>{shown.answer.answer}</p>
            <p>
              <small>
                {shown.sample ? "Pre-written sample answer. " : ""}
                Based only on this document. Check with the clinic if you are
                unsure.
              </small>
            </p>
          </>
        )}
      </div>
      {shown && speaker.supported && (
        <div className="amcn-actions">
          {speaking ? (
            <Button onPress={speaker.stop}>Stop reading</Button>
          ) : (
            <Button
              onPress={() =>
                speaker.speak(
                  answerToSpeech(shown.answer),
                  speechRate,
                  voiceURI,
                )
              }
            >
              Read answer aloud
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
