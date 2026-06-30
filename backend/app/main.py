from fastapi import FastAPI

from app.routes.analyze import router as analyze_router


app = FastAPI(
    title="ASCAP Registration Triage API",
    description="Backend-only metadata triage API for comparing ASCAP work metadata against public repertoire candidates.",
    version="0.1.0",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(analyze_router, prefix="/api", tags=["analysis"])
