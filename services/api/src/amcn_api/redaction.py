"""Best-effort removal of identifiers before text leaves the device.

Regex redaction is a safety net, not a guarantee: names and free-text addresses are NOT
caught. The UI must say so and let users review the redacted text before sending.
"""

import re
from dataclasses import dataclass

_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b")),
    ("PHONE", re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)")),
    ("DATE", re.compile(r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:\d{2}|\d{4})\b")),
    (
        "ID",
        re.compile(
            r"\b(?:member|policy|group|mrn|id)\s*(?:#|no\.?|number)?\s*[:#]?\s*[A-Z0-9-]{6,}\b",
            re.I,
        ),
    ),
]


@dataclass(frozen=True)
class RedactionResult:
    text: str
    counts: dict[str, int]


def redact(text: str) -> RedactionResult:
    counts: dict[str, int] = {}
    for label, pattern in _PATTERNS:
        text, n = pattern.subn(f"[{label} REDACTED]", text)
        if n:
            counts[label] = n
    return RedactionResult(text=text, counts=counts)
