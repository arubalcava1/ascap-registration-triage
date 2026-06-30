from fastapi import APIRouter

from app.schemas import CandidateDiscoveryRequest, CandidateDiscoveryResponse
from app.services.discovery import discover_candidate_actions


router = APIRouter()


@router.post("/discover-candidates", response_model=CandidateDiscoveryResponse)
def discover_candidates(request: CandidateDiscoveryRequest) -> CandidateDiscoveryResponse:
    return discover_candidate_actions(request.ascap_work)
