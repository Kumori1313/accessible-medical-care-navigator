# Accuracy evaluation

Measures how well the pipeline (photo → OCR → explanation) handles real forms, so error rates can be
documented before launch (roadmap Phase 1 exit criteria). Code: `services/api/src/amcn_api/evalharness/`.
Forms: `eval/forms/` (see `eval/forms/MANIFEST.md`). Answer keys: `eval/answers/`.

Run everything from the repository root:

```
H="uv run --project services/api python -m amcn_api.evalharness"

$H degrade --variants skew,dim,lowres,blur,phone   # make phone-photo-style copies (once)
$H run --ocr-only --variants original,phone        # score OCR only; needs no API key
AMCN_ANTHROPIC_API_KEY=... $H run                  # full run: OCR + explanation
$H run --ids sample-eob --level simple --max-pages 3
$H scaffold <form-id>                              # start an answer key from the form's OCR text
```

Reports are saved to `eval/results/<timestamp>.md` and `.json` (git-ignored). OCR output is cached by
image content (`eval/results/.ocr-cache`), so re-scoring a prompt change does not redo OCR; use
`--no-cache` to force it. A full run calls the model once per form per variant, so cost grows quickly:
start with `--ids` and `--max-pages`.

## Answer keys

One TOML file per form, named `<form-id>.toml`. Write it by reading the form, then set `reviewed = true`.
Reports flag unreviewed keys, because a wrong key makes every score meaningless.

```toml
id = "sample-eob"
reviewed = true
document_type = ["explanation of benefits", "eob"]   # any one counts as correct
ocr_must_contain = ["THIS IS NOT A BILL", "Claim Number"]   # exact phrases OCR should find
# pages = [1, 2]                                      # optional: only these pages

[[sections]]                          # a section a good explanation must cover
title = "What you owe"
keywords = ["what you owe", "patient balance"]   # any one in the model's section matches
required = true                                  # only if the form says so

[[traps]]                             # an important fact that must be mentioned
name = "An EOB is not a bill"
keywords = ["not a bill"]
```

## Current answer keys

All 15 forms in `eval/forms/MANIFEST.md` have a key in `eval/answers/`. Every one is a **draft** (`reviewed = false`):
they were written from each PDF's text layer (not from OCR), by a model, and have not been checked by a person.
On clean renders OCR finds 98% of the listed phrases; the two misses (CMS-1500 item 21, the VA 10-5345 title)
are recorded in those keys' notes and are real OCR weaknesses, not key errors.

## What is measured

| Metric | Meaning |
|---|---|
| OCR confidence | Mean Tesseract word confidence over the pages |
| OCR phrases | Share of `ocr_must_contain` phrases found in the OCR text (tolerates small misreads). Measures reading alone, independent of the model |
| Doc type | The model's document type (or summary) contains one of the expected terms |
| Sections | Share of expected sections the explanation covers |
| Required flags | Among covered sections whose key says required/optional, how often the model got it right. "Unknown" from the model is counted separately, not as wrong |
| Key facts | Share of `traps` mentioned anywhere in the explanation |
| Unsupported figures | Dollar amounts, dates, percentages and long numbers in the explanation that are not in the OCR text. A strong hallucination signal; an OCR digit error can also trigger it |
| Quoted | Share of sections with a verbatim source quote (the app already drops invented quotes) |
| Reading level OK | Flesch-Kincaid grade of the prose is within the target for the chosen level (simple ≤ 6, standard ≤ 9, detailed ≤ 12) |

**Error rate** = explained documents with at least one *critical error* ÷ explained documents. Critical
errors are the ones that could mislead someone: wrong document type, a missed key fact, a wrong
required/optional flag, a figure that is not in the source, or the explanation failing outright.
Missing a section is reported but is not counted as critical.

## Degraded variants

`degrade` writes `eval/forms/degraded/<variant>/` (git-ignored, reproducible): `skew` (rotated), `dim`
(dark with a shadow), `lowres` (900px wide), `blur`, and `phone` (several at once plus noise and heavy
JPEG compression). Clean renders flatter the pipeline; report the `phone` numbers too.

## Limits

- A small test set says little. The report warns when fewer than 50 documents are scored.
- Keyword matching is crude: a correct explanation phrased unexpectedly can be marked as a miss. Read the
  "Details of what went wrong" section before trusting a low score, and widen keywords where the model was
  right. Do not widen them just to raise a score.
- The model's output is not deterministic; repeat runs and compare.
- Scores check content, not whether the explanation is *useful or understandable*. That needs the usability
  sessions with disabled testers.
