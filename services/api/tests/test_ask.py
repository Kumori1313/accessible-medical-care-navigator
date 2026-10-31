import json

import pytest
from fastapi.testclient import TestClient

from amcn_api.ask import ASK_SYSTEM_PROMPT, UNCONFIRMED, AskError, ask_document
from amcn_api.figures import figures_missing_from
from amcn_api.main import app, get_provider

DOC = (
    "EXPLANATION OF BENEFITS. THIS IS NOT A BILL. What You Owe is the amount you owe after your "
    "insurer has paid. Total: $35.00. Appeals must be received within 120 days. "
    "Call 1-800-123-4567."
)


class FakeProvider:
    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, max_tokens: int = 2000) -> str:
        self.calls.append((system, user))
        return self.reply


def reply(**over: object) -> str:
    body: dict[str, object] = {
        "answer": "You owe $35.00 after your insurer has paid.",
        "found": True,
        "quote": "What You Owe is the amount you owe after your insurer has paid",
    }
    body.update(over)
    return "Sure: " + json.dumps(body)


def test_returns_a_grounded_answer_with_its_quote() -> None:
    a = ask_document(FakeProvider(reply()), DOC, "How much do I owe?")
    assert a.found and "$35.00" in a.answer and a.quote in DOC


def test_document_and_question_are_delimited_and_rules_say_untrusted() -> None:
    provider = FakeProvider(reply())
    ask_document(provider, DOC, "  How much do I owe?  ")
    system, user = provider.calls[0]
    assert "untrusted" in system and "ONLY the document" in system and "medical advice" in system
    assert "<document>" in user and "<question>\nHow much do I owe?\n</question>" in user
    assert "listening" in ASK_SYSTEM_PROMPT


def test_an_invented_quote_is_dropped() -> None:
    assert ask_document(FakeProvider(reply(quote="A line that is not there")), DOC, "q").quote == ""


def test_not_in_document_is_passed_through() -> None:
    answer = "This document does not say."
    a = ask_document(FakeProvider(reply(answer=answer, found=False, quote="")), DOC, "Dose?")
    assert not a.found and a.answer == answer


def test_an_answer_with_an_amount_not_in_the_document_is_replaced() -> None:
    a = ask_document(FakeProvider(reply(answer="You owe $350.00 by 4/1/24.")), DOC, "q")
    assert not a.found and a.answer == UNCONFIRMED and a.quote == ""


@pytest.mark.parametrize(
    "bad", ["sorry, no", "{}", '{"answer": "", "found": true}', '{"answer": 5}']
)
def test_unusable_replies_raise(bad: str) -> None:
    with pytest.raises(AskError):
        ask_document(FakeProvider(bad), DOC, "q")


def test_figures_missing_from_compares_by_value() -> None:
    assert figures_missing_from(DOC, "It is $35, within 120 days, phone 1-800-123-4567.") == ()
    assert figures_missing_from(DOC, "It is $36.00 and 50%.") == ("$36.00", "50%")


def test_endpoint_validates_input_and_maps_errors() -> None:
    client = TestClient(app)
    app.dependency_overrides[get_provider] = lambda: FakeProvider(reply())
    try:
        ok = client.post("/ask", json={"text": DOC, "question": "How much do I owe?"})
        assert ok.status_code == 200 and ok.json()["found"] is True
        assert client.post("/ask", json={"text": DOC, "question": ""}).status_code == 422
        assert client.post("/ask", json={"text": DOC, "question": "x" * 501}).status_code == 422
        assert client.post("/ask", json={"text": "", "question": "q"}).status_code == 422
        app.dependency_overrides[get_provider] = lambda: FakeProvider("nonsense")
        assert client.post("/ask", json={"text": DOC, "question": "q"}).status_code == 502
    finally:
        app.dependency_overrides.clear()
    assert client.post("/ask", json={"text": DOC, "question": "q"}).status_code == 503
