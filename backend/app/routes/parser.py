from fastapi import APIRouter

from app.schemas import CandidateParseRequest, CandidateParseResponse
from app.services.candidate_parser import parse_candidate_text


router = APIRouter()


@router.post("/parse-candidate", response_model=CandidateParseResponse)
def parse_candidate(request: CandidateParseRequest) -> CandidateParseResponse:
    return parse_candidate_text(request.source, request.raw_text)
