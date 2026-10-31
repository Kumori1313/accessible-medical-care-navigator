import {
  type Api,
  ApiError,
  type Explanation,
  type OcrResult,
  type ReadingLevel,
  createApi,
} from "@amcn/core";
import {
  Button,
  ConfidenceBadge,
  ErrorMessage,
  FileButton,
  SkipLink,
  StatusMessage,
  VerifyBanner,
} from "@amcn/ui";
import { useEffect, useRef, useState } from "react";
import { HighlightedText } from "./HighlightedText";

type Step = "choose" | "review" | "explained";

const defaultApi = createApi();

export function App({ api = defaultApi }: { api?: Api }) {
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<ReadingLevel>("standard");
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [selected, setSelected] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading so screen reader and keyboard users land in context.
  // Skipped on first render so the skip link stays the first tab stop.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);

  async function run<T>(
    working: string,
    task: () => Promise<T>,
  ): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setStatus(working);
    try {
      return await task();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setStatus("");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    const result = await run("Reading your document…", () => api.ocr(file));
    if (!result) return;
    setOcr(result);
    setText(result.text);
    setStatus("");
    setStep("review");
  }

  async function onRedact() {
    const result = await run("Removing personal details…", () =>
      api.redact(text),
    );
    if (!result) return;
    setText(result.text);
    const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
    setStatus(
      total
        ? `Removed ${total} personal detail${total === 1 ? "" : "s"}. Names and addresses are not removed automatically, so please check the text.`
        : "No personal details were found. Names and addresses are not detected automatically, so please check the text.",
    );
  }

  async function onExplain() {
    const result = await run("Explaining your document…", () =>
      api.explain(text, level),
    );
    if (!result) return;
    setExplanation(result);
    setSelected(0);
    setStatus("");
    setStep("explained");
  }

  const current = explanation?.sections[selected];

  return (
    <>
      <SkipLink />
      <header>
        <p>Accessible Medical Care Navigator</p>
      </header>
      <main id="main" tabIndex={-1}>
        <StatusMessage>{busy || status ? status : null}</StatusMessage>
        {error && <ErrorMessage>{error}</ErrorMessage>}

        {step === "choose" && (
          <section aria-labelledby="h-choose">
            <h1 id="h-choose" ref={heading} tabIndex={-1}>
              Understand my paperwork
            </h1>
            <p>
              Add a photo or picture of a medical form, bill or letter. Nothing
              is sent anywhere until you choose to.
            </p>
            <p>
              <FileButton camera onFile={onFile}>
                Take a photo
              </FileButton>{" "}
              <FileButton onFile={onFile}>Choose an image</FileButton>
            </p>
          </section>
        )}

        {step === "review" && ocr && (
          <section aria-labelledby="h-review">
            <h1 id="h-review" ref={heading} tabIndex={-1}>
              Check the text we read
            </h1>
            <ConfidenceBadge confidence={ocr.confidence} />
            {ocr.low_confidence && (
              <p>
                The photo was hard to read. Fix any mistakes below, or go back
                and try a clearer photo.
              </p>
            )}
            <label htmlFor="doc-text">Document text (you can edit it)</label>
            <textarea
              id="doc-text"
              className="amcn-field"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p>
              <label htmlFor="level">Reading level </label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as ReadingLevel)}
              >
                <option value="simple">Simple</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </select>
            </p>
            <p>
              <Button onPress={onRedact} isDisabled={busy || !text.trim()}>
                Remove personal details
              </Button>{" "}
              <Button onPress={onExplain} isDisabled={busy || !text.trim()}>
                Explain this document
              </Button>{" "}
              <Button onPress={() => setStep("choose")} isDisabled={busy}>
                Start over
              </Button>
            </p>
          </section>
        )}

        {step === "explained" && explanation && (
          <section aria-labelledby="h-explained">
            <h1 id="h-explained" ref={heading} tabIndex={-1}>
              {explanation.document_type}
            </h1>
            <VerifyBanner />
            <p>{explanation.summary}</p>
            <div className="amcn-columns">
              <div>
                <h2>What each part asks</h2>
                <ol>
                  {explanation.sections.map((s, i) => (
                    <li key={i}>
                      <Button
                        onPress={() => setSelected(i)}
                        aria-pressed={i === selected}
                      >
                        {s.title}
                      </Button>
                      <p>
                        {s.what_it_asks}
                        {s.required === true && " (Required)"}
                        {s.required === false && " (Optional)"}
                      </p>
                    </li>
                  ))}
                </ol>
                {explanation.uncertain.length > 0 && (
                  <>
                    <h2>Parts we were unsure about</h2>
                    <ul>
                      {explanation.uncertain.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div>
                <h2>Your original</h2>
                <div
                  className="amcn-original"
                  // Focusable so keyboard users can scroll long documents (WCAG 2.1.1).
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  tabIndex={0}
                  role="region"
                  aria-label="Original document text"
                >
                  <HighlightedText text={text} quote={current?.quote ?? ""} />
                </div>
              </div>
            </div>
            <p>
              <Button onPress={() => setStep("review")}>Back to text</Button>{" "}
              <Button onPress={() => setStep("choose")}>Start over</Button>
            </p>
          </section>
        )}
      </main>
    </>
  );
}
