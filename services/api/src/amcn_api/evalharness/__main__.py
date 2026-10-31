"""Command line: run the evaluation, make degraded copies, or scaffold an answer key.

From the repository root:

    uv run --project services/api python -m amcn_api.evalharness run
    uv run --project services/api python -m amcn_api.evalharness degrade --variants phone,dim
    uv run --project services/api python -m amcn_api.evalharness scaffold sample-eob
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from ..explain import ReadingLevel
from ..ocr import run_ocr
from ..providers import LLMProvider, ProviderNotConfiguredError, provider_from_env
from .degrade import VARIANTS, degrade_bytes
from .keys import AnswerKeyError, load_keys
from .ocr_helpers import first_lines
from .report import render_markdown
from .runner import DocResult, OcrCache, evaluate_document, find_pages


def _forms_dir(root: Path, variant: str) -> Path:
    return root / "forms" / ("jpg" if variant == "original" else f"degraded/{variant}")


def cmd_run(args: argparse.Namespace) -> int:
    root = Path(args.eval_dir)
    try:
        keys = load_keys(root / "answers")
    except AnswerKeyError as exc:
        print(f"Answer key problem: {exc}", file=sys.stderr)
        return 2
    wanted = set(args.ids.split(",")) if args.ids else None
    if wanted and not wanted <= keys.keys():
        print(f"No answer key for: {', '.join(sorted(wanted - keys.keys()))}", file=sys.stderr)
        return 2
    if not keys:
        print(
            f"No answer keys in {root / 'answers'}. Run `scaffold <id>` to start one.",
            file=sys.stderr,
        )
        return 2

    provider: LLMProvider | None = None
    if not args.ocr_only:
        try:
            provider = provider_from_env()
        except ProviderNotConfiguredError as exc:
            print(f"{exc} (or pass --ocr-only to score OCR alone)", file=sys.stderr)
            return 2

    cache = OcrCache(None if args.no_cache else root / "results" / ".ocr-cache")
    level: ReadingLevel = args.level
    results: list[DocResult] = []
    for variant in args.variants.split(","):
        images = _forms_dir(root, variant)
        for key_id, key in keys.items():
            if wanted and key_id not in wanted:
                continue
            pages = find_pages(images, key_id, key.pages, args.max_pages)
            if not pages:
                print(f"skip {key_id} ({variant}): no page images in {images}", file=sys.stderr)
                continue
            print(f"{key_id} [{variant}] {len(pages)} page(s)...", file=sys.stderr, flush=True)
            results.append(evaluate_document(key, pages, provider, level, variant, run_ocr, cache))

    if not results:
        print("Nothing was scored.", file=sys.stderr)
        return 2
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    meta = {
        "Date": stamp,
        "Model": "none (OCR only)"
        if provider is None
        else __import__("os").environ.get("AMCN_MODEL", "claude-sonnet-5-5"),
        "Reading level": level,
        "Variants": args.variants,
        "Pages per document": str(args.max_pages or "all"),
    }
    out = root / "results"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{stamp}.json").write_text(json.dumps([r.to_json() for r in results], indent=2))
    report = render_markdown(results, meta)
    (out / f"{stamp}.md").write_text(report)
    print(report)
    print(f"Saved to {out / stamp}.md and .json", file=sys.stderr)
    return 0


def cmd_degrade(args: argparse.Namespace) -> int:
    root = Path(args.eval_dir) / "forms"
    unknown = [v for v in args.variants.split(",") if v not in VARIANTS]
    if unknown:
        print(
            f"Unknown variant(s): {', '.join(unknown)}. Choose from: {', '.join(VARIANTS)}",
            file=sys.stderr,
        )
        return 2
    sources = sorted((root / "jpg").glob("*.jpg"))
    if not sources:
        print(f"No JPGs in {root / 'jpg'}", file=sys.stderr)
        return 2
    for variant in args.variants.split(","):
        target = root / "degraded" / variant
        target.mkdir(parents=True, exist_ok=True)
        for src in sources:
            (target / src.name).write_bytes(degrade_bytes(src.read_bytes(), src.stem, variant))
        print(f"{variant}: wrote {len(sources)} images to {target}", file=sys.stderr)
    return 0


_TEMPLATE = """# Answer key for {id}. Fill this in by reading the form, then set reviewed = true.
id = "{id}"
reviewed = false

# Any one of these appearing in the model's document type counts as right.
document_type = []

# Phrases OCR must find (measures reading, independent of the model). Copy a few exact ones.
ocr_must_contain = []

# Optional: only these 1-based pages (default: every page found).
# pages = [1, 2]

# One block per section a good explanation must cover.
# [[sections]]
# title = "Medications"
# keywords = ["medication", "drugs you take"]   # any one in the model's section counts
# required = true                               # omit if the form does not say

# One block per important fact that must be mentioned somewhere.
# [[traps]]
# name = "Deadline to return the form"
# keywords = ["30 days", "within 30"]

# --- OCR text, first lines, to help you write the key (delete when done) ---
{excerpt}
"""


def cmd_scaffold(args: argparse.Namespace) -> int:
    root = Path(args.eval_dir)
    target = root / "answers" / f"{args.id}.toml"
    if target.exists():
        print(f"{target} already exists; not overwriting.", file=sys.stderr)
        return 2
    pages = find_pages(_forms_dir(root, "original"), args.id, None, 1)
    excerpt = ""
    if pages:
        excerpt = first_lines(run_ocr(pages[0].read_bytes()).text, 40)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(_TEMPLATE.format(id=args.id, excerpt=excerpt))
    print(f"Wrote {target}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="amcn_api.evalharness", description=__doc__.split("\n")[0] if __doc__ else ""
    )
    parser.add_argument(
        "--eval-dir", default="eval", help="folder holding forms/, answers/ and results/"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="score OCR and explanations against the answer keys")
    run.add_argument(
        "--variants",
        default="original",
        help="comma list: original, skew, dim, lowres, blur, phone",
    )
    run.add_argument("--ids", help="comma list of form ids (default: all with answer keys)")
    run.add_argument("--level", choices=["simple", "standard", "detailed"], default="standard")
    run.add_argument("--max-pages", type=int, help="only the first N pages of each form (cheaper)")
    run.add_argument("--ocr-only", action="store_true", help="skip the model; needs no API key")
    run.add_argument(
        "--no-cache", action="store_true", help="redo OCR instead of reusing cached results"
    )
    run.set_defaults(func=cmd_run)

    deg = sub.add_parser("degrade", help="make phone-photo-style copies of the clean renders")
    deg.add_argument("--variants", default="phone", help=f"comma list from: {', '.join(VARIANTS)}")
    deg.set_defaults(func=cmd_degrade)

    scaf = sub.add_parser("scaffold", help="start an answer key for a form")
    scaf.add_argument("id")
    scaf.set_defaults(func=cmd_scaffold)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    code: int = args.func(args)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
