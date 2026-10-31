import io
from dataclasses import dataclass

import pytesseract
from PIL import Image, ImageOps, UnidentifiedImageError


class UnreadableImageError(ValueError):
    pass


@dataclass(frozen=True)
class OcrResult:
    text: str
    #: Mean word confidence, 0-100. None when no words were recognised.
    confidence: float | None


def run_ocr(image_bytes: bytes, lang: str = "eng") -> OcrResult:
    try:
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
        image = ImageOps.grayscale(image)
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
