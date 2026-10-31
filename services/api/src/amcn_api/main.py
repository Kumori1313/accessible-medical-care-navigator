import os
from typing import Annotated

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .ask import Answer, AskError, ask_document
from .explain import Explanation, ExplanationError, ReadingLevel, explain_document
from .ocr import UnreadableImageError, run_ocr
from .providers import LLMProvider, ProviderNotConfiguredError, provider_from_env
from .redaction import redact

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
LOW_CONFIDENCE = 70.0

app = FastAPI(title="Accessible Medical Care Navigator API")

# Native shells load the app from their own origin, so the browser enforces CORS against this API.
# Only those origins are allowed by default; the website uses the same-origin /api proxy.
# Override with AMCN_CORS_ORIGINS (comma-separated) when serving the web app from elsewhere.
DEFAULT_CORS_ORIGINS = [
    "tauri://localhost",  # Tauri on macOS/Linux
    "http://tauri.localhost",  # Tauri on Windows
    "https://tauri.localhost",
    "https://localhost",  # Capacitor Android (androidScheme: https)
    "capacitor://localhost",  # Capacitor iOS
]


def cors_origins() -> list[str]:
    raw = os.environ.get("AMCN_CORS_ORIGINS")
    if raw is None:
        return DEFAULT_CORS_ORIGINS
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_provider() -> LLMProvider:
    try:
        return provider_from_env()
    except ProviderNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


class OcrResponse(BaseModel):
    text: str
    confidence: float | None
    low_confidence: bool


@app.post("/ocr")
async def ocr(file: Annotated[UploadFile, File()]) -> OcrResponse:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (15 MB maximum).")
    try:
        result = run_ocr(data)
    except UnreadableImageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    low = result.confidence is None or result.confidence < LOW_CONFIDENCE
    return OcrResponse(text=result.text, confidence=result.confidence, low_confidence=low)


class RedactRequest(BaseModel):
    text: str = Field(max_length=100_000)


class RedactResponse(BaseModel):
    text: str
    counts: dict[str, int]


@app.post("/redact")
def redact_text(body: RedactRequest) -> RedactResponse:
    result = redact(body.text)
    return RedactResponse(text=result.text, counts=result.counts)


class ExplainRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    reading_level: ReadingLevel = "standard"


@app.post("/explain")
def explain(
    body: ExplainRequest, provider: Annotated[LLMProvider, Depends(get_provider)]
) -> Explanation:
    """Explain text the client has already reviewed (and redacted, if the user chose to)."""
    try:
        return explain_document(provider, body.text, body.reading_level)
    except ExplanationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class AskRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    question: str = Field(min_length=1, max_length=500)


@app.post("/ask")
def ask(body: AskRequest, provider: Annotated[LLMProvider, Depends(get_provider)]) -> Answer:
    """Answer a question using only the document text the client submits."""
    try:
        return ask_document(provider, body.text, body.question)
    except AskError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
