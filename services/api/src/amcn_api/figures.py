"""Amounts, dates and long numbers in text, for checking that a model did not invent any."""

import re

_FIGURE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?"  # money
    r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b"  # dates
    r"|\b\d[\d,]*(?:\.\d+)?\s?%"  # percentages
    r"|\b\d{3,}(?:\.\d+)?\b"  # longer standalone numbers (IDs, phone numbers, codes)
)


def _figure_key(figure: str) -> str:
    """Compare figures by value: '$35', '$35.00' and '35.00' are the same figure."""
    key = re.sub(r"[^0-9/.]", "", figure).rstrip(".")
    return key.removesuffix(".00") if "/" not in key else key


def figures_missing_from(source: str, generated: str) -> tuple[str, ...]:
    """Figures in `generated` that never appear in `source` (in order, without repeats).

    A strong hallucination signal, though an OCR digit error in `source` can also trigger it.
    """
    present = {_figure_key(f) for f in _FIGURE.findall(source)}
    missing = [
        fig.strip()
        for fig in _FIGURE.findall(generated)
        if (key := _figure_key(fig)) and key not in present
    ]
    return tuple(dict.fromkeys(missing))
