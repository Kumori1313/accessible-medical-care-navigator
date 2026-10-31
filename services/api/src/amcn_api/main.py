from fastapi import FastAPI

app = FastAPI(title="Accessible Medical Care Navigator API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
