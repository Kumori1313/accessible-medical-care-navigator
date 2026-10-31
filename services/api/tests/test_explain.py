import json

import pytest
from fastapi.testclient import TestClient

from amcn_api.explain import ExplanationError, explain_document
from amcn_api.main import app, get_provider

DOC = "Patient Intake Form\nName: ______\nList current medications (required)"


class FakeProvider:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str:
        self.calls.append((system, user))
        return self.reply


def _reply(**over: object) -> str:
    body: dict[str, object] = {
        "document_type": "Intake form",
        "summary": "A form collecting basic patient details.",
        "sections": [
            {
                "title": "Medications",
                "what_it_asks": "List what you take.",
                "required": True,
                "quote": "List current medications (required)",
            },
            {"title": "Invented", "what_it_asks": "x", "required": None, "quote": "NOT IN DOC"},
        ],
        "uncertain": [],
    }
    body.update(over)
    return "Here you go:\n" + json.dumps(body)


def test_parses_and_drops_quotes_not_in_source() -> None:
    result = explain_document(FakeProvider(_reply()), DOC, "simple")
    assert result.sections[0].quote == "List current medications (required)"
    assert result.sections[1].quote == ""


def test_document_text_is_delimited_as_data_and_level_applied() -> None:
    provider = FakeProvider(_reply())
    explain_document(provider, DOC, "simple")
    system, user = provider.calls[0]
    assert "untrusted data" in system
    assert "<document>" in user and "5th-grade" in user


def test_unreadable_reply_raises() -> None:
    with pytest.raises(ExplanationError):
        explain_document(FakeProvider("sorry, no"), DOC, "standard")
    with pytest.raises(ExplanationError):
        explain_document(FakeProvider('{"summary": 1}'), DOC, "standard")


def test_endpoint_returns_explanation_and_503_without_provider() -> None:
    client = TestClient(app)
    app.dependency_overrides[get_provider] = lambda: FakeProvider(_reply())
    try:
        resp = client.post("/explain", json={"text": DOC, "reading_level": "simple"})
        assert resp.status_code == 200
        assert resp.json()["document_type"] == "Intake form"
    finally:
        app.dependency_overrides.clear()
    assert client.post("/explain", json={"text": DOC}).status_code == 503
