import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont

from amcn_api.main import app


def _png(text: str) -> bytes:
    image = Image.new("RGB", (900, 160), "white")
    ImageDraw.Draw(image).text((20, 50), text, fill="black", font=ImageFont.load_default(size=48))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def test_ocr_reads_text() -> None:
    resp = TestClient(app).post("/ocr", files={"file": ("f.png", _png("Patient Intake Form"))})
    assert resp.status_code == 200
    body = resp.json()
    assert "Intake" in body["text"]
    assert body["low_confidence"] is False


def test_ocr_rejects_non_image() -> None:
    resp = TestClient(app).post("/ocr", files={"file": ("f.txt", b"not an image")})
    assert resp.status_code == 422
