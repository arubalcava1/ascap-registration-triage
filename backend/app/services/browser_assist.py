import asyncio
import sys
from uuid import uuid4

from fastapi import HTTPException

from app.schemas import (
    BrowserAssistedCloseResponse,
    BrowserAssistedOpenTaskResponse,
    AscapWork,
    BrowserAssistedCaptureActivePageRequest,
    BrowserAssistedCaptureResponse,
    BrowserAssistedSession,
    BrowserAssistedTask,
)
from app.services.candidate_parser import parse_candidate_text
from app.services.discovery import DISCOVERY_DISCLAIMER, discover_candidate_actions


BROWSER_ASSIST_GUARDRAILS = [
    "Only public repertoire pages should be opened.",
    "Do not enter or store ASCAP, BMI, or Songview login credentials.",
    "Do not automate private ASCAP member portal actions.",
    "Do not bypass CAPTCHA, disclaimers, blocks, or access restrictions.",
    "Capture only visible page text after the user confirms approval.",
]

_SESSIONS: dict[str, BrowserAssistedSession] = {}
_BROWSERS: dict[str, "PlaywrightBrowserSession"] = {}


if sys.platform == "win32" and hasattr(asyncio, "WindowsProactorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


def start_browser_assisted_session(
    ascap_work: AscapWork,
    performer: str | None = None,
) -> BrowserAssistedSession:
    discovery = discover_candidate_actions(ascap_work, performer)
    session_id = f"browser-{uuid4().hex[:12]}"
    tasks = [
        BrowserAssistedTask(
            task_id=f"{session_id}-{index}",
            source=action.source,
            url=action.url,
            search_fields=action.search_fields,
            instructions=[
                "Open the public source page.",
                "Use the prepared search fields shown by the app.",
                "Handle any public disclaimer or CAPTCHA yourself.",
                "Confirm the visible result before capturing text.",
            ],
            status="requires_user_open",
        )
        for index, action in enumerate(discovery.actions, start=1)
    ]

    session = BrowserAssistedSession(
        session_id=session_id,
        tasks=tasks,
        guardrails=BROWSER_ASSIST_GUARDRAILS,
        summary=f"Prepared {len(tasks)} user-approved browser task(s).",
        disclaimer=DISCOVERY_DISCLAIMER,
    )
    _SESSIONS[session_id] = session
    return session


def capture_visible_text(
    session_id: str,
    source: str,
    visible_text: str,
    user_approved_capture: bool,
) -> BrowserAssistedCaptureResponse:
    if not user_approved_capture:
        raise HTTPException(
            status_code=400,
            detail="Visible text capture requires explicit user approval.",
        )

    parse_result = parse_candidate_text(source, visible_text)
    return BrowserAssistedCaptureResponse(
        session_id=session_id,
        source=source,
        parse_result=parse_result,
        guardrails=BROWSER_ASSIST_GUARDRAILS,
    )


def open_task_in_guided_browser(
    session_id: str,
    task_id: str,
) -> BrowserAssistedOpenTaskResponse:
    session = _session_or_404(session_id)
    task = _task_or_404(session, task_id)
    browser_session = _BROWSERS.get(session_id)
    if browser_session is None:
        browser_session = PlaywrightBrowserSession()
        _BROWSERS[session_id] = browser_session

    browser_session.open_url(task.url)
    return BrowserAssistedOpenTaskResponse(
        session_id=session_id,
        task_id=task.task_id,
        source=task.source,
        url=task.url,
        status="opened",
        message="Opened prepared public search in the guided browser. Select or expand the visible public result, then approve capture in the app.",
    )


def capture_active_page_text(
    request: BrowserAssistedCaptureActivePageRequest,
) -> BrowserAssistedCaptureResponse:
    if not request.user_approved_capture:
        raise HTTPException(
            status_code=400,
            detail="Active page capture requires explicit user approval.",
        )

    _session_or_404(request.session_id)
    browser_session = _BROWSERS.get(request.session_id)
    if browser_session is None:
        raise HTTPException(
            status_code=400,
            detail="No guided browser page is open for this session.",
        )

    visible_text = browser_session.visible_text()
    return capture_visible_text(
        session_id=request.session_id,
        source=request.source,
        visible_text=visible_text,
        user_approved_capture=True,
    )


def close_guided_browser_session(session_id: str) -> BrowserAssistedCloseResponse:
    browser_session = _BROWSERS.pop(session_id, None)
    if browser_session is not None:
        browser_session.close()
    _SESSIONS.pop(session_id, None)
    return BrowserAssistedCloseResponse(
        session_id=session_id,
        closed=True,
        message="Guided browser session closed.",
    )


def _session_or_404(session_id: str) -> BrowserAssistedSession:
    session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Browser-assisted session was not found.")
    return session


def _task_or_404(session: BrowserAssistedSession, task_id: str) -> BrowserAssistedTask:
    for task in session.tasks:
        if task.task_id == task_id:
            return task
    raise HTTPException(status_code=404, detail="Browser-assisted task was not found.")


class PlaywrightBrowserSession:
    def __init__(self) -> None:
        try:
            from playwright.sync_api import Error as PlaywrightError
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise HTTPException(
                status_code=500,
                detail=(
                    "Playwright is not installed. Run 'python -m pip install -r requirements.txt' "
                    "inside backend, then 'python -m playwright install chromium'."
                ),
            ) from exc

        self._playwright_error = PlaywrightError
        try:
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(headless=False)
        except PlaywrightError as exc:
            if hasattr(self, "_playwright"):
                self._playwright.stop()
            raise HTTPException(
                status_code=500,
                detail=_guided_browser_error_detail(exc),
            ) from exc
        except Exception as exc:
            if hasattr(self, "_playwright"):
                self._playwright.stop()
            raise HTTPException(
                status_code=500,
                detail=f"Guided browser could not start: {_exception_detail(exc)}",
            ) from exc
        self._page = self._browser.new_page()

    def open_url(self, url: str) -> None:
        try:
            self._page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except self._playwright_error as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Guided browser opened, but the public page did not load: {exc}",
            ) from exc

    def visible_text(self) -> str:
        try:
            text = self._page.locator("body").inner_text(timeout=10000).strip()
        except self._playwright_error as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Guided browser could not read visible page text: {exc}",
            ) from exc
        if not text:
            raise HTTPException(status_code=400, detail="No visible text was captured from the active page.")
        return text

    def close(self) -> None:
        try:
            self._browser.close()
        finally:
            self._playwright.stop()


def _guided_browser_error_detail(exc: Exception) -> str:
    message = str(exc)
    if "Executable doesn't exist" in message or "playwright install" in message:
        return (
            "Playwright is installed, but Chromium is missing. In the backend terminal run: "
            "python -m playwright install chromium"
        )
    return f"Guided browser could not start: {_exception_detail(exc)}"


def _exception_detail(exc: Exception) -> str:
    message = str(exc).strip()
    if message:
        return message
    return type(exc).__name__
