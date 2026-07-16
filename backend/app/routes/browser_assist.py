from fastapi import APIRouter

from app.schemas import (
    BrowserAssistedCaptureRequest,
    BrowserAssistedCaptureResponse,
    BrowserAssistedSession,
    BrowserAssistedStartRequest,
)
from app.services.browser_assist import capture_visible_text, start_browser_assisted_session


router = APIRouter()


@router.post("/browser-assisted/start", response_model=BrowserAssistedSession)
def start_browser_assisted(
    request: BrowserAssistedStartRequest,
) -> BrowserAssistedSession:
    return start_browser_assisted_session(request.ascap_work, request.performer)


@router.post("/browser-assisted/capture-visible-text", response_model=BrowserAssistedCaptureResponse)
def capture_browser_visible_text(
    request: BrowserAssistedCaptureRequest,
) -> BrowserAssistedCaptureResponse:
    return capture_visible_text(
        session_id=request.session_id,
        source=request.source,
        visible_text=request.visible_text,
        user_approved_capture=request.user_approved_capture,
    )
