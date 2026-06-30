from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_discover_candidates_returns_public_search_actions() -> None:
    response = client.post(
        "/api/discover-candidates",
        json={"ascap_work": _ascap_work(), "performer": "Sublime"},
    )

    assert response.status_code == 200
    data = response.json()

    assert data["summary"] == "Prepared 3 public repertoire discovery action(s)."
    assert "do not scrape public sites" in data["disclaimer"]

    sources = {action["source"] for action in data["actions"]}
    assert "ASCAP repertory" in sources
    assert "BMI / Songview repertoire" in sources
    assert "ISWC lookup" in sources

    title_actions = [action for action in data["actions"] if action["search_type"] == "title_performer"]
    assert title_actions
    assert all("THE GREATEST" in action["search_term"] for action in title_actions)
    assert any(action["search_term"] == "T-123456789-0" for action in data["actions"])

    ascap_action = next(action for action in data["actions"] if action["source"] == "ASCAP repertory")
    assert ascap_action["search_type"] == "title_performer"
    assert ascap_action["search_fields"] == {
        "title": "THE GREATEST",
        "performer": "Sublime",
    }
    assert "/ace/search/title/THE%20GREATEST/performer/Sublime" in ascap_action["url"]

    bmi_action = next(action for action in data["actions"] if action["source"] == "BMI / Songview repertoire")
    assert bmi_action["search_type"] == "title_performer"
    assert bmi_action["search_fields"] == {
        "title": "THE GREATEST",
        "performer": "Sublime",
        "mode": "BMI Repertoire",
    }


def test_discover_candidates_omits_iswc_action_when_missing() -> None:
    work = _ascap_work()
    work["iswc"] = None

    response = client.post("/api/discover-candidates", json={"ascap_work": work})

    assert response.status_code == 200
    data = response.json()
    assert {action["source"] for action in data["actions"]} == {
        "ASCAP repertory",
        "BMI / Songview repertoire",
    }


def _ascap_work() -> dict:
    return {
        "title": "THE GREATEST",
        "song_code": "123456789",
        "iswc": "T-123456789-0",
        "alternate_titles": [],
        "writers": [
            {"name": "Alex Rivera", "ipi_cae": None, "share": 50},
            {"name": "Jane Smith", "ipi_cae": None, "share": 50},
        ],
        "publishers": [
            {"name": "Example Publishing", "ipi_cae": None, "share": 100}
        ],
        "source_url": None,
        "notes": None,
    }
