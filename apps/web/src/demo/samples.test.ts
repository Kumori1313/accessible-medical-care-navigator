import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES, findSample } from "./samples";

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
