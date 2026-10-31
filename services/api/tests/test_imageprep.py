import io

import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from amcn_api import imageprep
from amcn_api.imageprep import (
    ALL_STEPS,
    DEFAULT_STEPS,
    estimate_skew,
    has_uneven_light,
    parse_steps,
    prepare,
)
from amcn_api.ocr import ocr_cache_tag, run_ocr


def text_page(width: int = 1000, lines: int = 9) -> Image.Image:
    """A white page of black text lines, enough structure for skew estimation."""
    image = Image.new("L", (width, int(width * 1.3)), 255)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=int(width * 0.04))
    for i in range(lines):
        draw.text(
            (width * 0.08, width * 0.1 + i * width * 0.1),
            "Patient Intake Form number " * 2,
            fill=0,
            font=font,
        )
    return image


def jpeg(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_parse_steps() -> None:
    assert parse_steps(None) == DEFAULT_STEPS
    assert parse_steps("") == DEFAULT_STEPS
    assert parse_steps("none") == ()
    assert parse_steps("deskew, clahe") == ("deskew", "clahe")
    with pytest.raises(ValueError, match="Unknown OCR cleanup step"):
        parse_steps("deskew,bogus")


@pytest.mark.parametrize("tilt", [-4.0, -1.5, 2.0, 5.0])
def test_estimate_skew_recovers_the_tilt(tilt: float) -> None:
    tilted = text_page().rotate(tilt, resample=Image.Resampling.BICUBIC, fillcolor=255)
    # It returns the rotation that straightens the page: the opposite of the tilt.
    assert estimate_skew(np.asarray(tilted, dtype=np.uint8)) == pytest.approx(-tilt, abs=0.6)


def test_straight_page_is_left_alone() -> None:
    page = np.asarray(text_page(), dtype=np.uint8)
    assert abs(estimate_skew(page)) < 0.6
    out = np.asarray(prepare(text_page(), ("deskew",)))
    assert out.shape == page.shape


def test_deskew_straightens_the_text_lines() -> None:
    page = text_page()
    tilted = page.rotate(4.0, resample=Image.Resampling.BICUBIC, fillcolor=255)
    fixed = prepare(tilted, ("deskew",))
    assert abs(estimate_skew(np.asarray(fixed, dtype=np.uint8))) < 0.8


def test_upscale_grows_small_images_and_shrinks_huge_ones() -> None:
    assert prepare(Image.new("L", (900, 1200), 255), ("upscale",)).size[0] == pytest.approx(
        2000, abs=2
    )
    assert prepare(Image.new("L", (2000, 2600), 255), ("upscale",)).size == (2000, 2600)
    assert prepare(Image.new("L", (6000, 8000), 255), ("upscale",)).size[0] == 3200


def test_illumination_flattening_removes_a_shadow_gradient() -> None:
    page = np.asarray(text_page(), dtype=np.float64)
    ramp = np.linspace(0.35, 1.0, page.shape[1])[None, :]
    shadowed = Image.fromarray((page * ramp).astype(np.uint8))
    before = np.asarray(shadowed)[:, :100].mean() / np.asarray(shadowed)[:, -100:].mean()
    flat = np.asarray(prepare(shadowed, ("illum",)))
    after = flat[:, :100].mean() / flat[:, -100:].mean()
    assert before < 0.5 < 0.9 < after  # left and right are now about equally bright


def test_output_is_grayscale_and_step_order_is_fixed() -> None:
    page = text_page().convert("RGB")
    a = prepare(page, ("deskew", "upscale", "clahe"))
    b = prepare(page, ("clahe", "upscale", "deskew"))
    assert a.mode == "L" and np.array_equal(np.asarray(a), np.asarray(b))
    assert set(ALL_STEPS) >= set(DEFAULT_STEPS)


def test_no_steps_just_converts_to_gray() -> None:
    out = prepare(Image.new("RGB", (300, 200), (200, 100, 50)), ())
    assert out.mode == "L" and out.size == (300, 200)


def test_run_ocr_reads_a_tilted_low_resolution_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AMCN_OCR_STEPS", raising=False)
    small = text_page(700, lines=4).rotate(3.0, resample=Image.Resampling.BICUBIC, fillcolor=255)
    result = run_ocr(jpeg(small))
    assert "Patient" in result.text and "Form" in result.text


def test_env_var_controls_steps_and_the_cache_tag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AMCN_OCR_STEPS", raising=False)
    default_tag = ocr_cache_tag()
    monkeypatch.setenv("AMCN_OCR_STEPS", "none")
    assert ocr_cache_tag().endswith(":none") and ocr_cache_tag() != default_tag
    monkeypatch.setenv("AMCN_OCR_STEPS", "upscale,deskew,clahe")
    assert "clahe" in ocr_cache_tag()
    monkeypatch.setenv("AMCN_OCR_STEPS", "bogus")
    with pytest.raises(ValueError):
        ocr_cache_tag()


def test_cache_tag_includes_the_pipeline_version() -> None:
    assert imageprep.PIPELINE_VERSION in ocr_cache_tag()


def as_gray(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L"), dtype=np.uint8)


def test_uneven_light_guard_flags_dim_and_shadowed_pages_but_not_clean_ones() -> None:
    clean = as_gray(text_page())
    assert not has_uneven_light(clean)
    assert has_uneven_light((clean * 0.6).astype(np.uint8))  # dim: grey paper
    ramp = np.linspace(0.4, 1.0, clean.shape[1])[None, :]
    assert has_uneven_light((clean * ramp).astype(np.uint8))  # shadow across the page
    down = np.linspace(0.4, 1.0, clean.shape[0])[:, None]
    assert has_uneven_light((clean * down).astype(np.uint8))


def test_a_dark_banner_alone_does_not_count_as_uneven_light() -> None:
    page = text_page()
    ImageDraw.Draw(page).rectangle((0, page.size[1] - 120, page.size[0], page.size[1]), fill=40)
    assert not has_uneven_light(as_gray(page))


def test_illum_auto_leaves_clean_pages_alone_and_fixes_dim_ones() -> None:
    clean = text_page()
    assert np.array_equal(as_gray(prepare(clean, ("illum_auto",))), as_gray(clean))
    dim = Image.fromarray((as_gray(clean) * 0.6).astype(np.uint8))
    fixed = as_gray(prepare(dim, ("illum_auto",)))
    assert (
        fixed[:50, :50].mean() > 230 > 160 > as_gray(dim)[:50, :50].mean() - 1
    )  # paper is white again


def test_sharpen_increases_edge_contrast_of_a_blurry_page() -> None:
    soft = text_page().filter(ImageFilter.GaussianBlur(2.0))
    before = cv2.Laplacian(as_gray(soft), cv2.CV_64F).var()
    after = cv2.Laplacian(as_gray(prepare(soft, ("sharpen",))), cv2.CV_64F).var()
    assert after > before * 1.5


def test_the_default_pipeline_is_the_one_the_experiment_chose() -> None:
    assert DEFAULT_STEPS == ("upscale", "deskew", "illum_auto", "sharpen")
