import hashlib
import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from ..explain import Explanation, ExplanationError, ReadingLevel, explain_document
from ..ocr import OcrResult, ocr_cache_tag, run_ocr
from ..providers import LLMProvider
from ..redaction import redact
from . import metrics
from .keys import AnswerKey

OcrFn = Callable[[bytes], OcrResult]


@dataclass
class DocResult:
    id: str
    variant: str
    reviewed: bool
    pages_used: int
    ocr_chars: int
    ocr_confidence: float | None
    ocr_phrase_recall: float | None
    ocr_missing: list[str]
    redactions: dict[str, int]
    # Everything below is None/empty when explaining was skipped or failed.
    explained: bool = False
    explain_error: str = ""
    explain_seconds: float | None = None
    explanation: Explanation | None = None
    type_ok: bool | None = None
    section_recall: float | None = None
    sections_missed: list[str] = field(default_factory=list)
    required_correct: int = 0
    required_total: int = 0
    required_unspecified: int = 0
    wrong_required: list[str] = field(default_factory=list)
    traps_total: int = 0
    traps_missed: list[str] = field(default_factory=list)
    unsupported_figures: list[str] = field(default_factory=list)
    quoted_fraction: float | None = None
    grade: float | None = None
    grade_ok: bool | None = None

    def critical_errors(self) -> list[str]:
        """Mistakes that could mislead someone. A document with any of these counts as an error."""
        if not self.explained:
            return [f"explanation failed: {self.explain_error}"] if self.explain_error else []
        errors: list[str] = []
        if self.type_ok is False:
            errors.append("wrong document type")
        errors += [f"missed key fact: {t}" for t in self.traps_missed]
        errors += [f"wrong required/optional: {w}" for w in self.wrong_required]
        errors += [f"figure not in source: {f}" for f in self.unsupported_figures]
        return errors

    def to_json(self) -> dict[str, object]:
        data: dict[str, object] = {k: v for k, v in self.__dict__.items() if k != "explanation"}
        data["explanation"] = self.explanation.model_dump() if self.explanation else None
        data["critical_errors"] = self.critical_errors()
        return data


_PAGE_NUMBER = re.compile(r"-(\d+)\.(?:jpe?g|png)$", re.I)


def find_pages(
    images_dir: Path, doc_id: str, pages: tuple[int, ...] | None, max_pages: int | None
) -> list[Path]:
    found: dict[int, Path] = {}
    for p in images_dir.glob(f"{doc_id}-*"):
        m = _PAGE_NUMBER.search(p.name)
        if m and p.name[: m.start()] == doc_id:
            found[int(m.group(1))] = p
    numbers = sorted(found)
    if pages is not None:
        numbers = [n for n in numbers if n in pages]
    if max_pages is not None:
        numbers = numbers[:max_pages]
    return [found[n] for n in numbers]


class OcrCache:
    """Remembers OCR output by image content, so re-scoring a prompt change does not redo OCR."""

    def __init__(self, directory: Path | None) -> None:
        self.directory = directory
        if directory:
            directory.mkdir(parents=True, exist_ok=True)

    def run(self, data: bytes, ocr: OcrFn) -> OcrResult:
        if not self.directory:
            return ocr(data)
        digest = hashlib.sha256(ocr_cache_tag().encode() + b"\0" + data).hexdigest()
        path = self.directory / f"{digest}.json"
        if path.exists():
            cached = json.loads(path.read_text())
            return OcrResult(text=cached["text"], confidence=cached["confidence"])
        result = ocr(data)
        path.write_text(json.dumps({"text": result.text, "confidence": result.confidence}))
        return result


def evaluate_document(
    key: AnswerKey,
    page_images: list[Path],
    provider: LLMProvider | None,
    level: ReadingLevel = "standard",
    variant: str = "original",
    ocr: OcrFn = run_ocr,
    cache: OcrCache | None = None,
) -> DocResult:
    cache = cache or OcrCache(None)
    texts: list[str] = []
    confidences: list[float] = []
    for page in page_images:
        result = cache.run(page.read_bytes(), ocr)
        texts.append(result.text)
        if result.confidence is not None:
            confidences.append(result.confidence)
    text = "\n\n".join(texts)

    recall = metrics.ocr_phrase_recall(text, key.ocr_must_contain)
    doc = DocResult(
        id=key.id,
        variant=variant,
        reviewed=key.reviewed,
        pages_used=len(page_images),
        ocr_chars=len(text),
        ocr_confidence=sum(confidences) / len(confidences) if confidences else None,
        ocr_phrase_recall=recall.recall,
        ocr_missing=list(recall.missing),
        redactions=redact(text).counts,
        traps_total=len(key.traps),
    )
    if provider is None or not text.strip():
        if provider is not None:
            doc.explain_error = "OCR found no text"
        return doc

    started = time.perf_counter()
    try:
        explanation = explain_document(provider, text, level)
    except ExplanationError as exc:
        doc.explain_error = str(exc)
        return doc
    doc.explain_seconds = time.perf_counter() - started

    sections = metrics.score_sections(explanation, key.sections)
    prose = metrics.reading_text(explanation)
    doc.explained = True
    doc.explanation = explanation
    doc.type_ok = metrics.document_type_ok(explanation, key)
    doc.section_recall = sections.recall
    doc.sections_missed = list(sections.missed)
    doc.required_correct = sections.required_correct
    doc.required_total = sections.required_total
    doc.required_unspecified = sections.required_unspecified
    doc.wrong_required = list(sections.wrong_required)
    doc.traps_missed = list(metrics.missed_traps(explanation, key))
    doc.unsupported_figures = list(metrics.unsupported_figures(explanation, text))
    doc.quoted_fraction = metrics.quoted_fraction(explanation)
    doc.grade = metrics.flesch_kincaid_grade(prose)
    doc.grade_ok = None if doc.grade is None else doc.grade <= metrics.TARGET_GRADE[level]
    return doc
