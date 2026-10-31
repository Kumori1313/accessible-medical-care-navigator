from collections import defaultdict
from dataclasses import dataclass
from statistics import mean

from .runner import DocResult

#: The roadmap's accuracy goal is a test set of at least this many real-world forms.
TARGET_DOCUMENTS = 50


def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{x * 100:.0f}%"


def num(x: float | None, digits: int = 1) -> str:
    return "n/a" if x is None else f"{x:.{digits}f}"


def _mean(values: list[float]) -> float | None:
    return mean(values) if values else None


@dataclass
class Summary:
    documents: int
    explained: int
    with_critical_errors: int
    ocr_confidence: float | None
    ocr_phrase_recall: float | None
    type_accuracy: float | None
    section_recall: float | None
    required_accuracy: float | None
    trap_recall: float | None
    unsupported_figure_docs: int
    quoted_fraction: float | None
    grade_within_target: float | None
    mean_explain_seconds: float | None

    @property
    def error_rate(self) -> float | None:
        """Share of explained documents with at least one critical error."""
        return None if not self.explained else self.with_critical_errors / self.explained


def summarize(results: list[DocResult]) -> Summary:
    done = [r for r in results if r.explained]
    types = [r.type_ok for r in done if r.type_ok is not None]
    req_total = sum(r.required_total for r in done)
    traps_total = sum(r.traps_total for r in done)
    grades = [r.grade_ok for r in done if r.grade_ok is not None]
    return Summary(
        documents=len(results),
        explained=len(done),
        with_critical_errors=sum(1 for r in done if r.critical_errors()),
        ocr_confidence=_mean([r.ocr_confidence for r in results if r.ocr_confidence is not None]),
        ocr_phrase_recall=_mean(
            [r.ocr_phrase_recall for r in results if r.ocr_phrase_recall is not None]
        ),
        type_accuracy=sum(types) / len(types) if types else None,
        section_recall=_mean([r.section_recall for r in done if r.section_recall is not None]),
        required_accuracy=sum(r.required_correct for r in done) / req_total if req_total else None,
        trap_recall=(1 - sum(len(r.traps_missed) for r in done) / traps_total)
        if traps_total
        else None,
        unsupported_figure_docs=sum(1 for r in done if r.unsupported_figures),
        quoted_fraction=_mean([r.quoted_fraction for r in done if r.quoted_fraction is not None]),
        grade_within_target=sum(grades) / len(grades) if grades else None,
        mean_explain_seconds=_mean(
            [r.explain_seconds for r in done if r.explain_seconds is not None]
        ),
    )


def render_markdown(results: list[DocResult], meta: dict[str, str]) -> str:
    by_variant: dict[str, list[DocResult]] = defaultdict(list)
    for r in results:
        by_variant[r.variant].append(r)

    lines = ["# Accuracy evaluation", ""]
    lines += [f"- **{k}:** {v}" for k, v in meta.items()]
    lines.append("")

    warnings: list[str] = []
    originals = len({r.id for r in results})
    if originals < TARGET_DOCUMENTS:
        warnings.append(
            f"Only {originals} documents scored; the roadmap calls for {TARGET_DOCUMENTS}+. "
            "Treat these numbers as a smoke test, not a published error rate."
        )
    unreviewed = sorted({r.id for r in results if not r.reviewed})
    if unreviewed:
        warnings.append(
            f"{len(unreviewed)} answer key(s) are unreviewed drafts, so scores against them "
            f"are unreliable: {', '.join(unreviewed)}"
        )
    if not any(r.explained for r in results):
        warnings.append("No explanations were scored (OCR-only run, or every explain call failed).")
    if warnings:
        lines += ["## Read this first", ""] + [f"- {w}" for w in warnings] + [""]

    lines += [
        "## Summary by variant",
        "",
        "| Variant | Docs | Error rate | OCR conf. | OCR phrases | Doc type | Sections "
        "| Required flags | Key facts | Docs w/ unsupported figures | Quoted | Reading level OK |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for variant, rs in by_variant.items():
        s = summarize(rs)
        lines.append(
            f"| {variant} | {s.documents} | {pct(s.error_rate)} | {num(s.ocr_confidence, 0)} | "
            f"{pct(s.ocr_phrase_recall)} | {pct(s.type_accuracy)} | {pct(s.section_recall)} | "
            f"{pct(s.required_accuracy)} | {pct(s.trap_recall)} | {s.unsupported_figure_docs} | "
            f"{pct(s.quoted_fraction)} | {pct(s.grade_within_target)} |"
        )
    lines += [
        "",
        "**Error rate** = explained documents with at least one critical error (wrong document "
        "type, a missed key fact, a wrong required/optional flag, or a figure that is not in the "
        "source) divided by explained documents.",
        "",
        "## Per document",
        "",
        "| Document | Variant | Pages | OCR conf. | OCR phrases | Type | Sections | Grade "
        "| Critical errors |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        errors = r.critical_errors()
        flag = {True: "ok", False: "WRONG", None: "-"}[r.type_ok] if r.explained else "-"
        lines.append(
            f"| {r.id}{'' if r.reviewed else ' (draft key)'} | {r.variant} | {r.pages_used} | "
            f"{num(r.ocr_confidence, 0)} | {pct(r.ocr_phrase_recall)} | {flag} | "
            f"{pct(r.section_recall)} | {num(r.grade)} | {len(errors)} |"
        )

    problems = [r for r in results if r.critical_errors() or r.ocr_missing or r.sections_missed]
    if problems:
        lines += ["", "## Details of what went wrong", ""]
        for r in problems:
            lines.append(f"### {r.id} ({r.variant})")
            lines += [f"- ERROR: {e}" for e in r.critical_errors()]
            if r.ocr_missing:
                lines.append(f"- OCR did not find: {'; '.join(repr(m) for m in r.ocr_missing)}")
            if r.sections_missed:
                lines.append(f"- Sections not explained: {'; '.join(r.sections_missed)}")
            if r.required_unspecified:
                lines.append(
                    f"- Required/optional left unspecified for {r.required_unspecified} section(s)"
                )
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"
