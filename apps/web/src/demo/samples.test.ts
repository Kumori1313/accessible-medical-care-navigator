import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES, findSample, matchCanned } from "./samples";

describe("demo samples", () => {
  it("has unique ids and lookups work", () => {
    const ids = DEMO_SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findSample("eob")?.id).toBe("eob");
    expect(findSample("nope")).toBeUndefined();
  });

  for (const sample of DEMO_SAMPLES) {
    describe(sample.id, () => {
      it("has real-looking OCR text and a shape the UI expects", () => {
        expect(sample.ocr.text.length).toBeGreaterThan(500);
        expect(sample.ocr.confidence).toBeGreaterThan(50);
        expect(sample.explanation.sections.length).toBeGreaterThan(0);
        expect(sample.explanation.summary.length).toBeGreaterThan(20);
      });

      it("only quotes text that really is in the OCR output (so highlighting works)", () => {
        for (const s of sample.explanation.sections) {
          expect(s.quote, `${s.title}: quote must be non-empty`).not.toBe("");
          expect(
            sample.ocr.text,
            `${s.title}: quote not found verbatim`,
          ).toContain(s.quote);
        }
      });

      it("only mentions dollar amounts that are in the source", () => {
        const text = JSON.stringify(sample.explanation);
        for (const amount of text.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? []) {
          expect(sample.ocr.text, `${amount} is not in the OCR text`).toContain(
            amount,
          );
        }
      });
    });
  }
});

describe("canned questions", () => {
  for (const sample of DEMO_SAMPLES) {
    describe(sample.id, () => {
      it("has questions whose answers are grounded in the OCR text", () => {
        expect(sample.questions.length).toBeGreaterThanOrEqual(3);
        for (const q of sample.questions) {
          if (q.answer.found)
            expect(sample.ocr.text, `${q.question}: quote`).toContain(
              q.answer.quote,
            );
          else expect(q.answer.quote).toBe("");
          for (const amount of q.answer.answer.match(
            /\$\d[\d,]*(?:\.\d+)?|\d{1,2}-\d{3}-\d{3}-\d{4}/g,
          ) ?? []) {
            expect(sample.ocr.text, `${amount} not in source`).toContain(
              amount,
            );
          }
        }
      });

      it("matches each suggested question to its own answer", () => {
        for (const q of sample.questions)
          expect(matchCanned(sample, q.question)).toBe(q);
      });
    });
  }

  it("understands natural variations and rejects unrelated questions", () => {
    const eob = findSample("eob")!;
    expect(matchCanned(eob, "so how much am I paying?")?.question).toBe(
      "How much do I owe?",
    );
    expect(matchCanned(eob, "what is the phone number")?.question).toBe(
      "Who do I call with questions?",
    );
    expect(matchCanned(eob, "is this a bill or what")?.question).toBe(
      "Is this a bill?",
    );
    expect(matchCanned(eob, "what is the weather tomorrow")).toBeUndefined();
    expect(matchCanned(eob, "")).toBeUndefined();
  });
});
