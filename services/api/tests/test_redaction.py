from amcn_api.redaction import redact


def test_redacts_common_identifiers() -> None:
    text = "SSN 123-45-6789, call (555) 123-4567 or a@b.com. DOB 01/02/1980. Member ID: ABC123456"
    result = redact(text)
    for secret in ["123-45-6789", "555", "a@b.com", "01/02/1980", "ABC123456"]:
        assert secret not in result.text
    assert set(result.counts) == {"SSN", "PHONE", "EMAIL", "DATE", "ID"}


def test_leaves_plain_text_alone() -> None:
    result = redact("Please list your current medications.")
    assert result.text == "Please list your current medications."
    assert result.counts == {}
