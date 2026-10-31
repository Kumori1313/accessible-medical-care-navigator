"""Make clean renders look like phone photos. Deterministic: same input, same output."""

import hashlib
import io
import random
from collections.abc import Callable

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

_TABLE = (150, 140, 130)  # what is visible around a page lying on a desk


def _rng(name: str, variant: str) -> random.Random:
    return random.Random(hashlib.sha256(f"{variant}:{name}".encode()).digest())


def _rotate(img: Image.Image, degrees: float) -> Image.Image:
    return img.rotate(degrees, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=_TABLE)


def _shadow(img: Image.Image, strength: float, rng: random.Random) -> Image.Image:
    """A soft gradient across the page, as from a lamp off to one side."""
    w, h = img.size
    ramp = Image.linear_gradient("L")
    if rng.random() < 0.5:
        ramp = ramp.transpose(Image.Transpose.ROTATE_90)  # square, so do this before resizing
    ramp = ramp.resize((w, h))
    ramp = ramp.point(lambda v: int(255 - strength * v))
    dark = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(img, dark, ramp)


def _noise(img: Image.Image, amount: float, rng: random.Random) -> Image.Image:
    # Built from the seeded generator (not Pillow's own) so the output is reproducible.
    w, h = img.size
    noise = Image.frombytes("L", (w, h), rng.randbytes(w * h)).convert("RGB")
    return Image.blend(img, ImageChops.add(img, noise, scale=2), amount)


def _tilt(img: Image.Image, rng: random.Random) -> Image.Image:
    """Mild perspective, as when the phone is not directly above the page."""
    w, h = img.size
    k = rng.uniform(-0.04, 0.04)
    coeffs = (1, k, 0, 0, 1 + abs(k) / 2, 0, k / w, 0)
    return img.transform(
        img.size, Image.Transform.PERSPECTIVE, coeffs, Image.Resampling.BICUBIC, fillcolor=_TABLE
    )


def skew(img: Image.Image, rng: random.Random) -> Image.Image:
    return _rotate(img, rng.choice([-1, 1]) * rng.uniform(2.0, 4.5))


def dim(img: Image.Image, rng: random.Random) -> Image.Image:
    img = ImageEnhance.Brightness(img).enhance(0.6)
    img = ImageEnhance.Contrast(img).enhance(0.8)
    return _shadow(img, 0.5, rng)


def lowres(img: Image.Image, rng: random.Random) -> Image.Image:
    w, h = img.size
    scale = 900 / max(w, 1)
    return img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)


def blur(img: Image.Image, rng: random.Random) -> Image.Image:
    return img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(1.6, 2.4)))


def phone(img: Image.Image, rng: random.Random) -> Image.Image:
    """Several problems at once, which is what a real photo usually has."""
    img = _rotate(img, rng.choice([-1, 1]) * rng.uniform(1.0, 3.0))
    img = _tilt(img, rng)
    img = _shadow(ImageEnhance.Brightness(img).enhance(0.8), 0.35, rng)
    img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.8, 1.3)))
    img = _noise(img, 0.15, rng)
    w, h = img.size
    return img.resize((int(w * 0.6), int(h * 0.6)), Image.Resampling.BILINEAR)


VARIANTS: dict[str, Callable[[Image.Image, random.Random], Image.Image]] = {
    "skew": skew,
    "dim": dim,
    "lowres": lowres,
    "blur": blur,
    "phone": phone,
}


def degrade_bytes(data: bytes, name: str, variant: str, quality: int = 45) -> bytes:
    """Apply `variant` to a JPEG/PNG and return a (lossy) JPEG, like a phone camera would."""
    if variant not in VARIANTS:
        raise ValueError(f"Unknown variant '{variant}'. Choose from: {', '.join(VARIANTS)}")
    img = Image.open(io.BytesIO(data)).convert("RGB")
    out = VARIANTS[variant](img, _rng(name, variant))
    buf = io.BytesIO()
    out.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()
