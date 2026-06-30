from fastapi import FastAPI

from app.routes.analyze import router as analyze_router
from app.routes.discovery import router as discovery_router
from app.routes.parser import router as parser_router


app = FastAPI(
    title="ASCAP Registration Triage API",
    description="Backend-only metadata triage API for comparing ASCAP work metadata against public repertoire candidates.",
    version="0.1.0",
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(analyze_router, prefix="/api", tags=["analysis"])
app.include_router(discovery_router, prefix="/api", tags=["discovery"])
app.include_router(parser_router, prefix="/api", tags=["parser"])
