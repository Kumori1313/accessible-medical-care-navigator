// @vitest-environment jsdom
import { type Api, ApiError, type RecognitionLike } from "@amcn/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { axe } from "vitest-axe";
import { expect, it, vi } from "vitest";
import { AskPanel } from "./AskPanel";
import { DEMO_SAMPLES, matchCanned } from "./demo/samples";
import type { SpeechEngine } from "./ReadAloud";

const DOC =
  "What You Owe is the amount you owe after your insurer has paid. Total $35.00.";

function apiWith(ask: Api["ask"]): Api {
  return { ocr: vi.fn(), redact: vi.fn(), explain: vi.fn(), ask };
}

class FakeRecognition implements RecognitionLike {
  lang = "";
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
  say(text: string, final = true) {
    this.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: final, 0: { transcript: text } }],
    });
  }
}

function fakeEngine() {
  const synth = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [],
  };
  const engine: SpeechEngine = {
    synth,
    make: (text) => ({
      text,
      rate: 1,
      voice: null,
      onend: null,
      onerror: null,
    }),
  };
  return { synth, engine };
}

function renderPanel(props: Partial<Parameters<typeof AskPanel>[0]> = {}) {
  const onAnswer = vi.fn();
  const ask = vi.fn().mockResolvedValue({
    answer: "You owe $35.00 after your insurer has paid.",
    found: true,
    quote: "What You Owe is the amount you owe",
  });
  const { engine, synth } = fakeEngine();
  const rec = new FakeRecognition();
  const view = render(
    <AskPanel
      text={DOC}
      api={apiWith(ask)}
      speechRate={1}
      voiceURI=""
      onAnswer={onAnswer}
      recognizer={() => rec}
      engine={engine}
      {...props}
    />,
  );
  return { ...view, ask, onAnswer, rec, synth };
}

it("a typed question is sent with the document, answered, and its source reported", async () => {
  const { ask, onAnswer, container, synth } = renderPanel();
  expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  await userEvent.type(
    screen.getByLabelText("Your question"),
    "How much do I owe?",
  );
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));

  expect(ask).toHaveBeenCalledWith(DOC, "How much do I owe?");
  expect(await screen.findByText(/You owe \$35.00/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Answer" })).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith(
    "What You Owe is the amount you owe",
  );
  expect(screen.getByText(/Based only on this document/)).toBeInTheDocument();
  expect((await axe(container)).violations).toEqual([]);
  // A typed question is never spoken unasked; a button offers it.
  expect(synth.speak).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Read answer aloud" }),
  );
  expect(synth.speak).toHaveBeenCalled();
});

it("pressing Enter in the box asks", async () => {
  const { ask } = renderPanel();
  await userEvent.type(
    screen.getByLabelText("Your question"),
    "Any deadline?{Enter}",
  );
  expect(ask).toHaveBeenCalledWith(DOC, "Any deadline?");
});

it("an answer that is not in the document is labelled as such and highlights nothing", async () => {
  const ask = vi.fn().mockResolvedValue({
    answer: "This document does not say.",
    found: false,
    quote: "",
  });
  const { onAnswer } = renderPanel({ api: apiWith(ask) });
  await userEvent.type(
    screen.getByLabelText("Your question"),
    "What dose?{Enter}",
  );
  expect(
    await screen.findByRole("heading", { name: "Not in this document" }),
  ).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith("");
});

it("shows a readable error when the service fails and keeps the question", async () => {
  const ask = vi
    .fn()
    .mockRejectedValue(new ApiError("Could not reach the service.", 0));
  renderPanel({ api: apiWith(ask) });
  await userEvent.type(screen.getByLabelText("Your question"), "Hello?{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not reach the service.",
  );
  expect(screen.getByLabelText("Your question")).toHaveValue("Hello?");
});

it("voice: listens, asks what it heard, and speaks the answer", async () => {
  const { rec, ask, synth } = renderPanel();
  expect(
    screen.getByText(/may send what you say to its own speech service/),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Speak your question" }),
  );
  expect(rec.start).toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Stop listening" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Listening/)).toBeInTheDocument();

  act(() => rec.say("how much do I owe", false));
  expect(screen.getByLabelText("Your question")).toHaveValue(
    "how much do I owe",
  );
  act(() => {
    rec.say("how much do I owe", true);
    rec.onend?.();
  });

  expect(await screen.findByText(/You owe \$35.00/)).toBeInTheDocument();
  expect(ask).toHaveBeenCalledWith(DOC, "how much do I owe");
  expect(synth.speak).toHaveBeenCalled(); // asked by voice, so answered by voice
});

it("voice errors point back to typing", async () => {
  const { rec } = renderPanel();
  await userEvent.click(
    screen.getByRole("button", { name: "Speak your question" }),
  );
  act(() => {
    rec.onerror?.({ error: "not-allowed" });
    rec.onend?.();
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /type your question/,
  );
  expect(screen.getByLabelText("Your question")).toBeEnabled();
});

it("without speech input there is no microphone button, only typing", () => {
  renderPanel({ recognizer: null });
  expect(
    screen.queryByRole("button", { name: /Speak your question/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/speech service/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Your question")).toBeInTheDocument();
});

it("without speech output, nothing offers to read aloud", async () => {
  renderPanel({ engine: null });
  await userEvent.type(screen.getByLabelText("Your question"), "x?{Enter}");
  await screen.findByText(/You owe/);
  expect(
    screen.queryByRole("button", { name: /Read answer aloud/ }),
  ).not.toBeInTheDocument();
});

it("sample mode: suggested and reworded questions are answered with no server call", async () => {
  const sample = DEMO_SAMPLES.find((s) => s.id === "eob")!;
  const { ask, onAnswer, container } = renderPanel({
    text: sample.ocr.text,
    canned: {
      questions: sample.questions,
      lookup: (q) => matchCanned(sample, q),
    },
  });
  expect(screen.getByText("Try asking:")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Is this a bill?" }),
  );
  expect(
    await screen.findByText(/An EOB is not a bill|not a bill/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Pre-written sample answer/)).toBeInTheDocument();
  expect(onAnswer).toHaveBeenLastCalledWith("An EOB is NOT A BILL");

  await userEvent.clear(screen.getByLabelText("Your question"));
  await userEvent.type(
    screen.getByLabelText("Your question"),
    "so how much am I paying?{Enter}",
  );
  expect(await screen.findByText(/\$35\.00/)).toBeInTheDocument();
  expect(ask).not.toHaveBeenCalled();
  expect((await axe(container)).violations).toEqual([]);
});

it("sample mode: an unmatched question tries the server and, if it fails, suggests the samples", async () => {
  const sample = DEMO_SAMPLES.find((s) => s.id === "eob")!;
  const ask = vi
    .fn()
    .mockRejectedValue(new ApiError("Could not reach the service.", 0));
  renderPanel({
    api: apiWith(ask),
    text: sample.ocr.text,
    canned: {
      questions: sample.questions,
      lookup: (q) => matchCanned(sample, q),
    },
  });
  await userEvent.type(
    screen.getByLabelText("Your question"),
    "what is the weather tomorrow?{Enter}",
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /suggested questions/,
  );
  expect(ask).toHaveBeenCalledOnce();
});
