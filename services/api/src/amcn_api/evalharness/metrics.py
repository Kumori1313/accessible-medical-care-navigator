"""Scoring functions. All pure, so they are easy to test without OCR or a model."""

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from ..explain import Explanation
from ..figures import figures_missing_from
from .keys import AnswerKey, ExpectedSection

_WORD = re.compile(r"[a-z0-9$%]+")


def tokens(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def normalize(text: str) -> str:
    return " ".join(tokens(text))


def fuzzy_contains(text: str, phrase: str, threshold: float = 0.85) -> bool:
    """True if `phrase` appears in `text`, tolerating the odd OCR misread."""
    haystack, needle = tokens(text), tokens(phrase)
    if not needle:
        return False
    if normalize(phrase) in " ".join(haystack):
        return True
    target = " ".join(needle)
    n = len(needle)
    for size in {n, max(1, n - 1), n + 1}:
        for i in range(len(haystack) - size + 1):
            window = " ".join(haystack[i : i + size])
            if abs(len(window) - len(target)) > max(2, len(target) // 4):
                continue
            if SequenceMatcher(None, window, target).ratio() >= threshold:
                return True
    return False


@dataclass(frozen=True)
class PhraseRecall:
    recall: float | None
    missing: tuple[str, ...]


def ocr_phrase_recall(ocr_text: str, phrases: tuple[str, ...]) -> PhraseRecall:
    if not phrases:
        return PhraseRecall(None, ())
    missing = tuple(p for p in phrases if not fuzzy_contains(ocr_text, p))
    return PhraseRecall(1 - len(missing) / len(phrases), missing)


def explanation_text(e: Explanation) -> str:
    parts = [e.document_type, e.summary, *e.uncertain]
    for s in e.sections:
        parts += [s.title, s.what_it_asks]
    return "\n".join(parts)


def _has_any(text: str, keywords: tuple[str, ...]) -> bool:
    haystack = normalize(text)
    return any(normalize(k) in haystack for k in keywords)


def document_type_ok(e: Explanation, key: AnswerKey) -> bool | None:
    if not key.document_type:
        return None
    return _has_any(f"{e.document_type} {e.summary}", key.document_type)


@dataclass(frozen=True)
class SectionScore:
    recall: float | None
    missed: tuple[str, ...]
    required_correct: int
    required_total: int
    #: Expected flag was known but the model said "unknown"; counted separately, not as wrong.
    required_unspecified: int
    wrong_required: tuple[str, ...]


def score_sections(e: Explanation, expected: tuple[ExpectedSection, ...]) -> SectionScore:
    if not expected:
        return SectionScore(None, (), 0, 0, 0, ())
    missed: list[str] = []
    wrong: list[str] = []
    correct = total = unspecified = 0
    for want in expected:
        match = next(
            (s for s in e.sections if _has_any(f"{s.title} {s.what_it_asks}", want.keywords)), None
        )
        if match is None:
            missed.append(want.title)
            continue
        if want.required is None:
            continue
        if match.required is None:
            unspecified += 1
            continue
        total += 1
        if match.required == want.required:
            correct += 1
        else:
            wrong.append(f"{want.title} (form says {'required' if want.required else 'optional'})")
    recall = 1 - len(missed) / len(expected)
    return SectionScore(recall, tuple(missed), correct, total, unspecified, tuple(wrong))


def missed_traps(e: Explanation, key: AnswerKey) -> tuple[str, ...]:
    text = explanation_text(e)
    return tuple(t.name for t in key.traps if not _has_any(text, t.keywords))


def unsupported_figures(e: Explanation, ocr_text: str) -> tuple[str, ...]:
    """Amounts, dates and numbers in the explanation that never appear in the source text."""
    return figures_missing_from(ocr_text, explanation_text(e))


def quoted_fraction(e: Explanation) -> float | None:
    """Share of sections carrying a verbatim source quote (the app drops invented ones)."""
    if not e.sections:
        return None
    return sum(1 for s in e.sections if s.quote) / len(e.sections)


def _syllables(word: str) -> int:
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 0
    count = len(re.findall(r"[aeiouy]+", word))
    if word.endswith("e") and not word.endswith(("le", "ee")) and count > 1:
        count -= 1
    return max(1, count)


def flesch_kincaid_grade(text: str) -> float | None:
    words = re.findall(r"[A-Za-z']+", text)
    sentences = [s for s in re.split(r"[.!?]+(?:\s|$)", text) if s.strip()]
    if len(words) < 5 or not sentences:
        return None
    syllables = sum(_syllables(w) for w in words)
    return 0.39 * len(words) / len(sentences) + 11.8 * syllables / len(words) - 15.59


def reading_text(e: Explanation) -> str:
    """The prose a person reads: the summary and each section's explanation."""
    return " ".join([e.summary, *[s.what_it_asks for s in e.sections]])


#: Highest acceptable grade level for each reading-level setting.
TARGET_GRADE = {"simple": 6.0, "standard": 9.0, "detailed": 12.0}
