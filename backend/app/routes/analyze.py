from fastapi import APIRouter

from app.schemas import AnalyzeRequest, AnalyzeResponse
from app.services.matcher import analyze_candidates


router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return analyze_candidates(request.ascap_work, request.candidates)
