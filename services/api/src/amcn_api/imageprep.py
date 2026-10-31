"""Clean up a photographed page before OCR.

Tesseract does well on clean scans but struggles with what a phone camera produces: tilted pages,
uneven light and shadows, soft focus and low resolution. Each step here targets one of those and
can be switched on or off, so the evaluation harness can measure what actually helps.
"""

import cv2
import numpy as np
from numpy.typing import NDArray
from PIL import Image

Gray = NDArray[np.uint8]

#: Bump when a step changes, so cached OCR results from an older pipeline are not reused.
PIPELINE_VERSION = "prep-2"

ALL_STEPS = ("upscale", "deskew", "clahe", "illum", "illum_auto", "sharpen", "denoise")
DEFAULT_STEPS: tuple[str, ...] = ("upscale", "deskew", "illum_auto", "sharpen")

# Tesseract reads best when body text is roughly 20-30 px tall, about a 2000 px wide letter page.
_TARGET_WIDTH = 2000
_MAX_WIDTH = 3200


def _u8(array: object) -> Gray:
    """OpenCV's return types are loose; this pins them to an 8-bit grayscale array."""
    return np.asarray(array, dtype=np.uint8)


def parse_steps(value: str | None) -> tuple[str, ...]:
    """Steps from a comma list ('none' for no cleanup, empty/None for the default)."""
    if value is None or not value.strip():
        return DEFAULT_STEPS
    if value.strip().lower() == "none":
        return ()
    steps = tuple(s.strip() for s in value.split(",") if s.strip())
    unknown = [s for s in steps if s not in ALL_STEPS]
    if unknown:
        raise ValueError(
            f"Unknown OCR cleanup step(s): {', '.join(unknown)}. Choose from {ALL_STEPS}."
        )
    return steps


def _scale(gray: Gray) -> Gray:
    h, w = gray.shape
    if w < _TARGET_WIDTH * 0.8:
        factor = min(3.0, _TARGET_WIDTH / w)
        return _u8(cv2.resize(gray, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC))
    if w > _MAX_WIDTH:
        factor = _MAX_WIDTH / w
        return _u8(cv2.resize(gray, None, fx=factor, fy=factor, interpolation=cv2.INTER_AREA))
    return gray


def _rotate(gray: Gray, degrees: float) -> Gray:
    h, w = gray.shape
    m = cv2.getRotationMatrix2D((w / 2, h / 2), degrees, 1.0)
    return _u8(
        cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    )


def _row_sharpness(ink: Gray, degrees: float) -> float:
    """Aligned text lines make row sums spiky; tilted ones smear them out."""
    rows = _rotate(ink, degrees).sum(axis=1, dtype=np.float64)
    return float(rows.var())


def estimate_skew(gray: Gray) -> float:
    """Degrees to rotate the page so its text lines are horizontal (counter-clockwise positive)."""
    h, w = gray.shape
    small = cv2.resize(gray, (800, max(1, int(h * 800 / w))), interpolation=cv2.INTER_AREA)
    _, binary = cv2.threshold(small, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    ink = _u8(binary)
    coarse = np.arange(-10.0, 10.01, 0.5)
    best = max(coarse, key=lambda a: _row_sharpness(ink, float(a)))
    fine = np.arange(best - 0.5, best + 0.51, 0.1)
    return float(max(fine, key=lambda a: _row_sharpness(ink, float(a))))


def _deskew(gray: Gray) -> Gray:
    angle = estimate_skew(gray)
    return gray if abs(angle) < 0.3 else _rotate(gray, angle)


def _clahe(gray: Gray) -> Gray:
    return _u8(cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray))


def _flatten_illumination(gray: Gray) -> Gray:
    """Divide out the slowly varying paper brightness (shadows, a lamp on one side)."""
    background = cv2.medianBlur(cv2.dilate(gray, np.ones((7, 7), np.uint8)), 21)
    return _u8(cv2.divide(gray, np.maximum(background, 1), scale=255))


def has_uneven_light(gray: Gray) -> bool:
    """True for a dim page or one with a shadow or lamp gradient across it.

    Clean scans and well-lit photos should skip illumination flattening: it can erase light text
    on dark banners and gains nothing there. Row and column medians follow the paper's brightness
    and ignore text and banners, which cover only part of any one row or column.
    """
    h, w = gray.shape
    small = cv2.resize(gray, (400, max(1, int(h * 400 / w))), interpolation=cv2.INTER_AREA)
    if float(np.percentile(small, 90)) < 185:  # the paper itself is grey, not white
        return True
    cols = cv2.GaussianBlur(np.median(small, axis=0).reshape(1, -1).astype(np.float32), (0, 0), 6)
    rows_all = np.median(small, axis=1)
    margin = int(len(rows_all) * 0.12)  # ignore banners at the very top and bottom
    rows = cv2.GaussianBlur(
        rows_all[margin : len(rows_all) - margin].reshape(1, -1).astype(np.float32), (0, 0), 6
    )
    for profile in (cols, rows):
        lo, hi = np.percentile(profile, [5, 95])
        if hi > 0 and lo < 0.85 * hi:
            return True
    return False


def _illum_if_uneven(gray: Gray) -> Gray:
    return _flatten_illumination(gray) if has_uneven_light(gray) else gray


def _sharpen(gray: Gray) -> Gray:
    """Unsharp mask: recovers some edge contrast lost to soft focus."""
    soft = cv2.GaussianBlur(gray, (0, 0), 3)
    return _u8(cv2.addWeighted(gray, 1.8, soft, -0.8, 0))


def _denoise(gray: Gray) -> Gray:
    return _u8(cv2.medianBlur(gray, 3))


_STEP_FUNCS = {
    "upscale": _scale,
    "deskew": _deskew,
    "clahe": _clahe,
    "illum": _flatten_illumination,
    "illum_auto": _illum_if_uneven,
    "sharpen": _sharpen,
    "denoise": _denoise,
}


def prepare(image: Image.Image, steps: tuple[str, ...] = DEFAULT_STEPS) -> Image.Image:
    """Return a grayscale page ready for OCR, applying `steps` in a fixed, sensible order."""
    gray: Gray = np.asarray(image.convert("L"), dtype=np.uint8)
    for name in ALL_STEPS:  # fixed order regardless of how the caller listed them
        if name in steps:
            gray = _STEP_FUNCS[name](gray)
    return Image.fromarray(gray)
