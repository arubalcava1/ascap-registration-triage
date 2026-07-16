from uuid import uuid4

from fastapi import HTTPException

from app.schemas import (
    AscapWork,
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

    return BrowserAssistedSession(
        session_id=session_id,
        tasks=tasks,
        guardrails=BROWSER_ASSIST_GUARDRAILS,
        summary=f"Prepared {len(tasks)} user-approved browser task(s).",
        disclaimer=DISCOVERY_DISCLAIMER,
    )


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
