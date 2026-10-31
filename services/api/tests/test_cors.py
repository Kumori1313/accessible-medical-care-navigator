from fastapi.testclient import TestClient

from amcn_api.main import app


def preflight(origin: str) -> dict[str, str]:
    resp = TestClient(app).options(
        "/explain",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    return dict(resp.headers)


def test_native_shell_origins_are_allowed() -> None:
    for origin in ["tauri://localhost", "https://localhost", "capacitor://localhost"]:
        assert preflight(origin).get("access-control-allow-origin") == origin


def test_arbitrary_websites_are_not() -> None:
    assert "access-control-allow-origin" not in preflight("https://evil.example")
