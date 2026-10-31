"""Hand-written answer keys. One TOML file per form: what a correct reading must contain."""

import tomllib
from dataclasses import dataclass
from pathlib import Path


class AnswerKeyError(ValueError):
    pass


@dataclass(frozen=True)
class ExpectedSection:
    title: str
    #: A model section matches if any keyword appears in its title or explanation.
    keywords: tuple[str, ...]
    #: True/False if the form says so; None when the form does not say (not scored).
    required: bool | None = None


@dataclass(frozen=True)
class Trap:
    """An important fact the explanation must mention (a deadline, a warning, "not a bill")."""

    name: str
    keywords: tuple[str, ...]


@dataclass(frozen=True)
class AnswerKey:
    id: str
    #: False until a human has checked the key against the form. Reports flag unreviewed keys.
    reviewed: bool
    #: Any of these appearing in the model's document type (or summary) counts as correct.
    document_type: tuple[str, ...]
    #: 1-based pages that make up the document; None means every page found.
    pages: tuple[int, ...] | None
    #: Phrases OCR should find in the page text (measures reading, independent of the model).
    ocr_must_contain: tuple[str, ...]
    sections: tuple[ExpectedSection, ...]
    traps: tuple[Trap, ...]
    notes: str = ""


def _strings(value: object, where: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
        raise AnswerKeyError(f"{where} must be a list of non-empty strings")
    return tuple(value)


def _keywords(value: object, where: str) -> tuple[str, ...]:
    words = _strings(value, where)
    if not words:
        raise AnswerKeyError(f"{where} must not be empty")
    return words


def parse_key(data: dict[str, object], source: str = "key") -> AnswerKey:
    try:
        key_id = data["id"]
        if not isinstance(key_id, str) or not key_id:
            raise AnswerKeyError(f"{source}: id must be a non-empty string")
        sections: list[ExpectedSection] = []
        raw_sections = data.get("sections", [])
        if not isinstance(raw_sections, list):
            raise AnswerKeyError(f"{source}: sections must be an array of tables")
        for i, s in enumerate(raw_sections):
            required = s.get("required")
            if required is not None and not isinstance(required, bool):
                raise AnswerKeyError(f"{source}: sections[{i}].required must be true or false")
            sections.append(
                ExpectedSection(
                    title=str(s["title"]),
                    keywords=_keywords(s.get("keywords"), f"{source}: sections[{i}].keywords"),
                    required=required,
                )
            )
        traps: list[Trap] = []
        raw_traps = data.get("traps", [])
        if not isinstance(raw_traps, list):
            raise AnswerKeyError(f"{source}: traps must be an array of tables")
        for i, t in enumerate(raw_traps):
            traps.append(
                Trap(str(t["name"]), _keywords(t.get("keywords"), f"{source}: traps[{i}].keywords"))
            )
        pages = data.get("pages")
        if pages is not None and (
            not isinstance(pages, list) or not all(isinstance(p, int) and p >= 1 for p in pages)
        ):
            raise AnswerKeyError(f"{source}: pages must be a list of page numbers starting at 1")
        return AnswerKey(
            id=key_id,
            reviewed=bool(data.get("reviewed", False)),
            document_type=_strings(data.get("document_type", []), f"{source}: document_type"),
            pages=tuple(pages) if pages else None,
            ocr_must_contain=_strings(
                data.get("ocr_must_contain", []), f"{source}: ocr_must_contain"
            ),
            sections=tuple(sections),
            traps=tuple(traps),
            notes=str(data.get("notes", "")),
        )
    except KeyError as exc:
        raise AnswerKeyError(f"{source}: missing field {exc}") from exc


def load_key(path: Path) -> AnswerKey:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise AnswerKeyError(f"{path.name}: invalid TOML ({exc})") from exc
    key = parse_key(data, path.name)
    if key.id != path.stem:
        raise AnswerKeyError(f"{path.name}: id '{key.id}' must match the file name")
    return key


def load_keys(directory: Path) -> dict[str, AnswerKey]:
    return {p.stem: load_key(p) for p in sorted(directory.glob("*.toml"))}
