from fastapi import APIRouter

from app.schemas import (
    BrowserAssistedCaptureActivePageRequest,
    BrowserAssistedCaptureRequest,
    BrowserAssistedCaptureResponse,
    BrowserAssistedCloseRequest,
    BrowserAssistedCloseResponse,
    BrowserAssistedOpenTaskRequest,
    BrowserAssistedOpenTaskResponse,
    BrowserAssistedSession,
    BrowserAssistedStartRequest,
)
from app.services.browser_assist import (
    capture_active_page_text,
    capture_visible_text,
    close_guided_browser_session,
    open_task_in_guided_browser,
    start_browser_assisted_session,
)


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


@router.post("/browser-assisted/open-task", response_model=BrowserAssistedOpenTaskResponse)
def open_browser_task(
    request: BrowserAssistedOpenTaskRequest,
) -> BrowserAssistedOpenTaskResponse:
    return open_task_in_guided_browser(request.session_id, request.task_id)


@router.post("/browser-assisted/capture-active-page", response_model=BrowserAssistedCaptureResponse)
def capture_browser_active_page(
    request: BrowserAssistedCaptureActivePageRequest,
) -> BrowserAssistedCaptureResponse:
    return capture_active_page_text(request)


@router.post("/browser-assisted/close-session", response_model=BrowserAssistedCloseResponse)
def close_browser_session(
    request: BrowserAssistedCloseRequest,
) -> BrowserAssistedCloseResponse:
    return close_guided_browser_session(request.session_id)
