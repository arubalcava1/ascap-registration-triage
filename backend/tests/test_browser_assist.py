from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_browser_assisted_start_returns_guarded_tasks() -> None:
    response = client.post(
        "/api/browser-assisted/start",
        json={"ascap_work": _ascap_work(), "performer": "Example Artist"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["session_id"].startswith("browser-")
    assert "Only public repertoire pages should be opened." in data["guardrails"]
    assert "Do not store ASCAP, BMI, or Songview login credentials." not in data["guardrails"]
    assert len(data["tasks"]) == 3
    assert all(task["requires_user_approval"] for task in data["tasks"])
    assert {task["source"] for task in data["tasks"]} == {
        "ASCAP repertory",
        "BMI / Songview repertoire",
        "ISWC lookup",
    }


def test_browser_assisted_capture_requires_user_approval() -> None:
    response = client.post(
        "/api/browser-assisted/capture-visible-text",
        json={
            "session_id": "browser-test",
            "source": "ASCAP Repertory",
            "visible_text": "THE GREATEST\nISWC: T9019887935\nWork ID: 423537515",
            "user_approved_capture": False,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Visible text capture requires explicit user approval."


def test_browser_assisted_capture_parses_visible_text() -> None:
    response = client.post(
        "/api/browser-assisted/capture-visible-text",
        json={
            "session_id": "browser-test",
            "source": "ASCAP Repertory",
            "visible_text": """
THE GREATEST
ISWC: T9019887935
Work ID: 423537515
Writers
ALEX RIVERA ASCAP 123456789
Publishers
EXAMPLE MUSIC PUBLISHING ASCAP 987654321
""",
            "user_approved_capture": True,
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["session_id"] == "browser-test"
    assert data["parse_result"]["candidate"]["title"] == "THE GREATEST"
    assert data["parse_result"]["candidate"]["public_work_id"] == "423537515"
    assert data["parse_result"]["candidate"]["writers"][0]["name"] == "ALEX RIVERA"


def test_browser_assisted_open_task_rejects_unknown_session() -> None:
    response = client.post(
        "/api/browser-assisted/open-task",
        json={"session_id": "browser-missing", "task_id": "task-missing"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Browser-assisted session was not found."


def test_browser_assisted_capture_active_page_requires_user_approval() -> None:
    start = client.post(
        "/api/browser-assisted/start",
        json={"ascap_work": _ascap_work(), "performer": "Example Artist"},
    )
    session_id = start.json()["session_id"]

    response = client.post(
        "/api/browser-assisted/capture-active-page",
        json={
            "session_id": session_id,
            "source": "ASCAP Repertory",
            "user_approved_capture": False,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Active page capture requires explicit user approval."


def test_browser_assisted_close_session_is_idempotent() -> None:
    response = client.post(
        "/api/browser-assisted/close-session",
        json={"session_id": "browser-anything"},
    )

    assert response.status_code == 200
    assert response.json()["closed"] is True


def _ascap_work() -> dict:
    return {
        "title": "THE GREATEST",
        "song_code": "123456789",
        "iswc": "T-123456789-0",
        "alternate_titles": [],
        "writers": [{"name": "Alex Rivera", "ipi_cae": None, "share": 50}],
        "publishers": [{"name": "Example Publishing", "ipi_cae": None, "share": 100}],
        "source_url": None,
        "notes": None,
    }
