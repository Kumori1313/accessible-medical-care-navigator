import {
  type AccessPreferences,
  type Api,
  ApiError,
  type Explanation,
  type OcrResult,
  type ReadingLevel,
  applyPreferences,
  createApi,
  createPreferencesStore,
  explanationToSpeech,
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
import { Onboarding } from "./Onboarding";
import { PwaNotices } from "./PwaNotices";
import { usePwa } from "./pwa";
import { ReadAloud } from "./ReadAloud";
import { Settings } from "./Settings";

type Step = "choose" | "review" | "explained";

const defaultApi = createApi();

type PreferencesStore = ReturnType<typeof createPreferencesStore>;

/** Reading localStorage can throw (blocked cookies, private windows); fall back to no persistence. */
function browserStore(): PreferencesStore {
  try {
    return createPreferencesStore(window.localStorage);
  } catch {
    return createPreferencesStore({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
    });
  }
}

const defaultStore = browserStore();

export function App({
  api = defaultApi,
  store = defaultStore,
}: {
  api?: Api;
  store?: PreferencesStore;
}) {
  const [initial] = useState(() => store.load());
  const [prefs, setPrefs] = useState<AccessPreferences>(initial.preferences);
  const [view, setView] = useState<"onboarding" | "app" | "settings">(
    initial.onboarded ? "app" : "onboarding",
  );
  const [saved, setSaved] = useState(true);
  const pwa = usePwa();
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [text, setText] = useState("");
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
  }, [step, view]);

  // Apply display preferences to the page. The dyslexia font is only downloaded when turned on.
  useEffect(() => {
    applyPreferences(prefs, document.documentElement);
    if (prefs.dyslexiaFont)
      void import("@fontsource/opendyslexic/latin-400.css");
  }, [prefs]);

  function updatePrefs(next: AccessPreferences) {
    setPrefs(next);
    setSaved(store.save(next));
  }

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
      api.explain(text, prefs.readingLevel),
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
        {view === "app" && (
          <Button onPress={() => setView("settings")}>Settings</Button>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <StatusMessage>{busy || status ? status : null}</StatusMessage>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <PwaNotices {...pwa} />

        {view === "onboarding" && (
          <Onboarding
            onPreview={setPrefs}
            onDone={(p) => {
              updatePrefs(p);
              setView("app");
            }}
          />
        )}

        {view === "settings" && (
          <Settings
            value={prefs}
            onChange={updatePrefs}
            onDone={() => setView("app")}
            saved={saved}
          />
        )}

        {view === "app" && step === "choose" && (
          <section aria-labelledby="h-choose">
            <h1 id="h-choose" ref={heading} tabIndex={-1}>
              Understand my paperwork
            </h1>
            <p>
              Add a photo or picture of a medical form, bill or letter. Nothing
              is sent anywhere until you choose to.
            </p>
            <div className="amcn-actions">
              <FileButton camera onFile={onFile}>
                Take a photo
              </FileButton>{" "}
              <FileButton onFile={onFile}>Choose an image</FileButton>
            </div>
          </section>
        )}

        {view === "app" && step === "review" && ocr && (
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
                value={prefs.readingLevel}
                onChange={(e) =>
                  updatePrefs({
                    ...prefs,
                    readingLevel: e.target.value as ReadingLevel,
                  })
                }
              >
                <option value="simple">Simple</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </select>
            </p>
            <div className="amcn-actions">
              <Button onPress={onRedact} isDisabled={busy || !text.trim()}>
                Remove personal details
              </Button>{" "}
              <Button onPress={onExplain} isDisabled={busy || !text.trim()}>
                Explain this document
              </Button>{" "}
              <Button onPress={() => setStep("choose")} isDisabled={busy}>
                Start over
              </Button>
            </div>
          </section>
        )}

        {view === "app" && step === "explained" && explanation && (
          <section aria-labelledby="h-explained">
            <h1 id="h-explained" ref={heading} tabIndex={-1}>
              {explanation.document_type}
            </h1>
            <VerifyBanner />
            <p>{explanation.summary}</p>
            <ReadAloud
              chunks={explanationToSpeech(explanation)}
              rate={prefs.speechRate}
              voiceURI={prefs.voiceURI}
              onChange={({ rate, voiceURI }) =>
                updatePrefs({ ...prefs, speechRate: rate, voiceURI })
              }
            />
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
            <div className="amcn-actions">
              <Button onPress={() => setStep("review")}>Back to text</Button>{" "}
              <Button onPress={() => setStep("choose")}>Start over</Button>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
