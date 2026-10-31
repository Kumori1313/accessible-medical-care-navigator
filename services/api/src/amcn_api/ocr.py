import io
import os
from dataclasses import dataclass

import pytesseract
from PIL import Image, ImageOps, UnidentifiedImageError

from .imageprep import PIPELINE_VERSION, parse_steps, prepare


class UnreadableImageError(ValueError):
    pass


@dataclass(frozen=True)
class OcrResult:
    text: str
    #: Mean word confidence, 0-100. None when no words were recognised.
    confidence: float | None


def configured_steps() -> tuple[str, ...]:
    """Cleanup steps to apply, from AMCN_OCR_STEPS ("none" disables; unset uses the default)."""
    return parse_steps(os.environ.get("AMCN_OCR_STEPS"))


def ocr_cache_tag() -> str:
    """Identifies the current cleanup pipeline, so cached OCR from another one is not reused."""
    return f"{PIPELINE_VERSION}:{','.join(configured_steps()) or 'none'}"


def run_ocr(
    image_bytes: bytes, lang: str = "eng", steps: tuple[str, ...] | None = None
) -> OcrResult:
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        image = prepare(image, configured_steps() if steps is None else steps)
    except (UnidentifiedImageError, OSError) as exc:
        raise UnreadableImageError("Could not read the file as an image.") from exc

    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    words = [
        (w, float(c))
        for w, c in zip(data["text"], data["conf"], strict=True)
        if w.strip() and float(c) >= 0
    ]
    text = pytesseract.image_to_string(image, lang=lang).strip()
    confidence = sum(c for _, c in words) / len(words) if words else None
    return OcrResult(text=text, confidence=confidence)
