import io
import json
from collections.abc import Callable
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

from amcn_api.evalharness import metrics
from amcn_api.evalharness.__main__ import main
from amcn_api.evalharness.degrade import VARIANTS, degrade_bytes
from amcn_api.evalharness.keys import (
    AnswerKey,
    AnswerKeyError,
    ExpectedSection,
    Trap,
    load_key,
    load_keys,
    parse_key,
)
from amcn_api.evalharness.report import render_markdown, summarize
from amcn_api.evalharness.runner import OcrCache, evaluate_document, find_pages
from amcn_api.explain import Explanation, Section
from amcn_api.ocr import OcrResult

SOURCE = (
    "EXPLANATION OF BENEFITS. THIS IS NOT A BILL. Claim Number 12345678. "
    "Provider charges $406.60. Allowed charges $120.27. What you owe $35.00. Date paid 3/20/22."
)


def explanation(**over: object) -> Explanation:
    base: dict[str, object] = {
        "document_type": "Explanation of Benefits",
        "summary": "This is not a bill. It shows what your plan paid. You owe $35.00.",
        "sections": [
            Section(
                title="What you owe",
                what_it_asks="The amount left for you to pay.",
                required=None,
                quote="What you owe $35.00",
            ),
            Section(
                title="Provider charges",
                what_it_asks="What the provider billed.",
                required=None,
                quote="",
            ),
        ],
        "uncertain": [],
    }
    base.update(over)
    return Explanation.model_validate(base)


KEY = AnswerKey(
    id="eob",
    reviewed=True,
    document_type=("explanation of benefits", "eob"),
    pages=None,
    ocr_must_contain=("THIS IS NOT A BILL", "Claim Number"),
    sections=(
        ExpectedSection("Patient owes", ("what you owe", "patient balance")),
        ExpectedSection("Provider charges", ("provider charges",)),
    ),
    traps=(Trap("not a bill", ("not a bill",)),),
)


# ---------- answer keys ----------


def test_parse_key_reads_every_field() -> None:
    key = parse_key(
        {
            "id": "x",
            "reviewed": True,
            "document_type": ["bill"],
            "pages": [1, 3],
            "ocr_must_contain": ["Total"],
            "sections": [{"title": "T", "keywords": ["k"], "required": True}],
            "traps": [{"name": "n", "keywords": ["due"]}],
        }
    )
    assert key.pages == (1, 3) and key.sections[0].required is True and key.traps[0].name == "n"


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"id": "x", "sections": [{"title": "T", "keywords": []}]},
        {"id": "x", "sections": [{"title": "T", "keywords": ["k"], "required": "yes"}]},
        {"id": "x", "pages": [0]},
        {"id": "x", "traps": [{"name": "n"}]},
    ],
)
def test_parse_key_rejects_bad_input(data: dict[str, object]) -> None:
    with pytest.raises(AnswerKeyError):
        parse_key(data)


def test_load_key_checks_file_name_and_syntax(tmp_path: Path) -> None:
    (tmp_path / "a.toml").write_text('id = "b"\n')
    with pytest.raises(AnswerKeyError, match="must match the file name"):
        load_key(tmp_path / "a.toml")
    (tmp_path / "c.toml").write_text("id = ")
    with pytest.raises(AnswerKeyError, match="invalid TOML"):
        load_key(tmp_path / "c.toml")
    (tmp_path / "a.toml").write_text('id = "a"\n')
    (tmp_path / "c.toml").unlink()
    assert list(load_keys(tmp_path)) == ["a"]


# ---------- metrics ----------


def test_fuzzy_match_tolerates_ocr_noise_but_not_other_text() -> None:
    assert metrics.fuzzy_contains("Customer Servlce Number 1-800", "Customer Service Number")
    assert metrics.fuzzy_contains("THIS IS NOT A BILL", "this is not a bill")
    assert not metrics.fuzzy_contains("Totally different words here", "Customer Service Number")
    assert not metrics.fuzzy_contains("anything", "")


def test_ocr_phrase_recall() -> None:
    r = metrics.ocr_phrase_recall(SOURCE, ("NOT A BILL", "Claim Number", "Deductible Amount"))
    assert r.recall == pytest.approx(2 / 3) and r.missing == ("Deductible Amount",)
    assert metrics.ocr_phrase_recall(SOURCE, ()).recall is None


def test_document_type() -> None:
    assert metrics.document_type_ok(explanation(), KEY) is True
    wrong = explanation(document_type="Lab result", summary="Blood test numbers.")
    assert metrics.document_type_ok(wrong, KEY) is False
    assert (
        metrics.document_type_ok(explanation(), AnswerKey("x", True, (), None, (), (), ())) is None
    )


def test_section_scoring_and_required_flags() -> None:
    expected = (
        ExpectedSection("Owes", ("what you owe",), required=True),
        ExpectedSection("Charges", ("provider charges",), required=False),
        ExpectedSection("Missing one", ("deductible",)),
        ExpectedSection("Unknown", ("allowed",), required=True),
    )
    e = explanation(
        sections=[
            Section(title="What you owe", what_it_asks="x", required=True, quote=""),
            Section(title="Provider charges", what_it_asks="x", required=True, quote=""),
            Section(title="Allowed", what_it_asks="x", required=None, quote=""),
        ]
    )
    s = metrics.score_sections(e, expected)
    assert s.recall == pytest.approx(3 / 4) and s.missed == ("Missing one",)
    assert (s.required_correct, s.required_total, s.required_unspecified) == (1, 2, 1)
    assert s.wrong_required == ("Charges (form says optional)",)


def test_traps_are_found_anywhere_in_the_explanation() -> None:
    assert metrics.missed_traps(explanation(), KEY) == ()
    assert metrics.missed_traps(explanation(summary="It lists your charges."), KEY) == (
        "not a bill",
    )
    in_uncertain = explanation(summary="x", uncertain=["Remember: this is NOT A BILL"])
    assert metrics.missed_traps(in_uncertain, KEY) == ()


def test_unsupported_figures_flags_invented_amounts_and_dates() -> None:
    assert metrics.unsupported_figures(explanation(), SOURCE) == ()
    bad = explanation(summary="You owe $350.00 by 4/1/23, a 20% share, claim 99999999.")
    assert set(metrics.unsupported_figures(bad, SOURCE)) == {"$350.00", "4/1/23", "20%", "99999999"}
    same_value = explanation(summary="You owe $35 and the provider charged 406.60 dollars.")
    assert metrics.unsupported_figures(same_value, SOURCE) == ()


def test_quoted_fraction() -> None:
    assert metrics.quoted_fraction(explanation()) == 0.5
    assert metrics.quoted_fraction(explanation(sections=[])) is None


def test_reading_grade_orders_simple_below_complex() -> None:
    simple = "You owe $35. Pay it by mail. Call us if you have questions."
    hard = (
        "Notwithstanding the aforementioned adjudication, beneficiaries remain responsible for "
        "coinsurance obligations determined by contractual reimbursement methodologies."
    )
    assert metrics.flesch_kincaid_grade(simple) is not None
    assert metrics.flesch_kincaid_grade(hard) is not None
    assert metrics.flesch_kincaid_grade(simple) < metrics.flesch_kincaid_grade(hard)  # type: ignore[operator]
    assert metrics.flesch_kincaid_grade("Too short.") is None


# ---------- runner ----------


class FakeProvider:
    def __init__(self, reply: str) -> None:
        self.reply = reply

    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str:
        return self.reply


def reply_for(e: Explanation) -> str:
    return json.dumps(e.model_dump())


def fake_ocr(text: str = SOURCE, confidence: float | None = 91.0) -> Callable[[bytes], OcrResult]:
    return lambda data: OcrResult(text=text, confidence=confidence)


def pages(tmp_path: Path, n: int = 2) -> list[Path]:
    out = []
    for i in range(1, n + 1):
        p = tmp_path / f"eob-{i}.jpg"
        p.write_bytes(f"page{i}".encode())
        out.append(p)
    return out


def test_clean_run_has_no_critical_errors(tmp_path: Path) -> None:
    provider = FakeProvider(reply_for(explanation()))
    r = evaluate_document(KEY, pages(tmp_path), provider, ocr=fake_ocr())
    assert r.explained and r.critical_errors() == []
    assert r.pages_used == 2 and r.ocr_confidence == 91.0 and r.ocr_phrase_recall == 1.0
    assert r.section_recall == 1.0 and r.type_ok is True and r.traps_missed == []
    assert r.explain_seconds is not None and r.grade is not None


def test_hallucinated_figure_and_missed_fact_are_critical(tmp_path: Path) -> None:
    bad = explanation(summary="You owe $999.00 today.", document_type="Lab report")
    r = evaluate_document(KEY, pages(tmp_path), FakeProvider(reply_for(bad)), ocr=fake_ocr())
    errors = r.critical_errors()
    assert "wrong document type" in errors
    assert "missed key fact: not a bill" in errors
    assert any("$999.00" in e for e in errors)


def test_ocr_only_skips_the_model(tmp_path: Path) -> None:
    r = evaluate_document(KEY, pages(tmp_path), None, ocr=fake_ocr())
    assert not r.explained and r.critical_errors() == [] and r.ocr_phrase_recall == 1.0


def test_unreadable_pages_and_bad_model_output_are_reported(tmp_path: Path) -> None:
    blank = evaluate_document(KEY, pages(tmp_path), FakeProvider("{}"), ocr=fake_ocr(text="  "))
    assert blank.explain_error == "OCR found no text"
    broken = evaluate_document(KEY, pages(tmp_path), FakeProvider("sorry"), ocr=fake_ocr())
    assert not broken.explained and broken.critical_errors()[0].startswith("explanation failed")


def test_ocr_cache_reuses_results(tmp_path: Path) -> None:
    calls = []

    def counting(data: bytes) -> OcrResult:
        calls.append(data)
        return OcrResult(text="hello", confidence=80.0)

    cache = OcrCache(tmp_path / "cache")
    assert cache.run(b"img", counting).text == "hello"
    assert cache.run(b"img", counting).confidence == 80.0
    assert len(calls) == 1
    cache.run(b"other", counting)
    assert len(calls) == 2


def test_find_pages_orders_numerically_and_does_not_confuse_ids(tmp_path: Path) -> None:
    for name in ["a-1.jpg", "a-2.jpg", "a-10.jpg", "ab-1.jpg", "a-notes.txt"]:
        (tmp_path / name).write_bytes(b"x")

    def names(ps: list[Path]) -> list[str]:
        return [p.name for p in ps]

    assert names(find_pages(tmp_path, "a", None, None)) == ["a-1.jpg", "a-2.jpg", "a-10.jpg"]
    assert names(find_pages(tmp_path, "a", (2, 10), None)) == ["a-2.jpg", "a-10.jpg"]
    assert names(find_pages(tmp_path, "a", None, 2)) == ["a-1.jpg", "a-2.jpg"]
    assert find_pages(tmp_path, "nope", None, None) == []


# ---------- degradation ----------


def png(text: str = "Patient Intake Form") -> bytes:
    image = Image.new("RGB", (900, 200), "white")
    ImageDraw.Draw(image).text((20, 60), text, fill="black", font=ImageFont.load_default(size=56))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.parametrize("variant", sorted(VARIANTS))
def test_every_variant_makes_a_different_valid_jpeg_deterministically(variant: str) -> None:
    src = png()
    out = degrade_bytes(src, "doc-1", variant)
    assert out == degrade_bytes(src, "doc-1", variant)
    assert out != degrade_bytes(src, "doc-2", variant) or variant in {"lowres", "blur", "dim"}
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG" and img.size[0] > 100


def test_lowres_shrinks_and_unknown_variant_is_rejected() -> None:
    big = Image.new("RGB", (1700, 2200), "white")
    buf = io.BytesIO()
    big.save(buf, format="PNG")
    assert Image.open(io.BytesIO(degrade_bytes(buf.getvalue(), "d", "lowres"))).size[0] == 900
    with pytest.raises(ValueError, match="Unknown variant"):
        degrade_bytes(buf.getvalue(), "d", "sepia")


# ---------- report ----------


def test_summary_and_report_flag_what_a_reader_must_know(tmp_path: Path) -> None:
    good = evaluate_document(
        KEY, pages(tmp_path), FakeProvider(reply_for(explanation())), ocr=fake_ocr()
    )
    bad_exp = explanation(summary="You owe $999.00.")
    bad = evaluate_document(KEY, pages(tmp_path), FakeProvider(reply_for(bad_exp)), ocr=fake_ocr())
    s = summarize([good, bad])
    assert s.documents == 2 and s.explained == 2 and s.with_critical_errors == 1
    assert s.error_rate == 0.5 and s.unsupported_figure_docs == 1

    draft = AnswerKey("eob", False, KEY.document_type, None, (), KEY.sections, KEY.traps)
    draft_result = evaluate_document(draft, pages(tmp_path), None, ocr=fake_ocr())
    text = render_markdown([good, bad, draft_result], {"Model": "fake"})
    assert "Only 1 documents scored" in text and "unreviewed drafts" in text
    assert "figure not in source: $999.00" in text and "50%" in text


def test_ocr_only_report_says_nothing_was_explained(tmp_path: Path) -> None:
    r = evaluate_document(KEY, pages(tmp_path), None, ocr=fake_ocr())
    assert "No explanations were scored" in render_markdown([r], {})


# ---------- command line ----------


@pytest.fixture
def eval_dir(tmp_path: Path) -> Path:
    root = tmp_path / "eval"
    (root / "forms" / "jpg").mkdir(parents=True)
    (root / "answers").mkdir()
    (root / "forms" / "jpg" / "intake-1.jpg").write_bytes(png())
    (root / "answers" / "intake.toml").write_text(
        'id = "intake"\nreviewed = true\nocr_must_contain = ["Patient Intake Form"]\n'
    )
    return root


def test_cli_run_ocr_only_writes_reports(
    eval_dir: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["--eval-dir", str(eval_dir), "run", "--ocr-only", "--no-cache"]) == 0
    out = capsys.readouterr().out
    assert "intake" in out and "100%" in out
    assert len(list((eval_dir / "results").glob("*.md"))) == 1
    saved = json.loads(next((eval_dir / "results").glob("*.json")).read_text())
    assert saved[0]["id"] == "intake" and saved[0]["ocr_phrase_recall"] == 1.0


def test_cli_run_needs_a_key_or_ocr_only(
    eval_dir: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("AMCN_ANTHROPIC_API_KEY", raising=False)
    assert main(["--eval-dir", str(eval_dir), "run"]) == 2
    assert "--ocr-only" in capsys.readouterr().err
    assert main(["--eval-dir", str(eval_dir), "run", "--ocr-only", "--ids", "nope"]) == 2


def test_cli_degrade_then_run_on_the_variant(eval_dir: Path) -> None:
    assert main(["--eval-dir", str(eval_dir), "degrade", "--variants", "skew"]) == 0
    assert (eval_dir / "forms" / "degraded" / "skew" / "intake-1.jpg").exists()
    code = main(
        [
            "--eval-dir",
            str(eval_dir),
            "run",
            "--ocr-only",
            "--variants",
            "original,skew",
            "--no-cache",
        ]
    )
    assert code == 0
    saved = json.loads(next((eval_dir / "results").glob("*.json")).read_text())
    assert {r["variant"] for r in saved} == {"original", "skew"}
    assert main(["--eval-dir", str(eval_dir), "degrade", "--variants", "sepia"]) == 2


def test_cli_scaffold_writes_a_template_and_never_overwrites(eval_dir: Path) -> None:
    assert main(["--eval-dir", str(eval_dir), "scaffold", "intake2"]) == 0
    template = eval_dir / "answers" / "intake2.toml"
    assert 'id = "intake2"' in template.read_text() and "reviewed = false" in template.read_text()
    assert load_key(template).reviewed is False
    assert main(["--eval-dir", str(eval_dir), "scaffold", "intake2"]) == 2
    (eval_dir / "forms" / "jpg" / "intake3-1.jpg").write_bytes(png("Hello Scaffold"))
    main(["--eval-dir", str(eval_dir), "scaffold", "intake3"])
    assert "Hello Scaffold" in (eval_dir / "answers" / "intake3.toml").read_text()


# ---------- the committed answer keys ----------

REPO = Path(__file__).resolve().parents[3]


def test_committed_answer_keys_are_valid_and_documented() -> None:
    keys = load_keys(REPO / "eval" / "answers")
    assert keys, "expected answer keys in eval/answers"
    manifest = (REPO / "eval" / "forms" / "MANIFEST.md").read_text()
    for key_id, key in keys.items():
        assert f"`{key_id}`" in manifest, f"{key_id} is not listed in eval/forms/MANIFEST.md"
        assert key.document_type, f"{key_id}: needs document_type"
        assert key.ocr_must_contain, f"{key_id}: needs ocr_must_contain"
        assert key.sections, f"{key_id}: needs at least one section"
        assert key.traps, f"{key_id}: needs at least one key fact"
