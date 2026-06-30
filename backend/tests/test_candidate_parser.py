from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_parse_candidate_from_structured_public_text() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "Songview",
            "raw_text": """
Title: GREATEST, THE
Work ID: SV-12345
ISWC: T-123456789-0
Writers:
Andrew Rubalcava | 33.33%
Jane Smith | 33.33%
Mark Lee | 33.34%
Publishers:
Example Publishing
Other Music Publishing
Status: Reconciled
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "GREATEST, THE"
    assert data["candidate"]["public_work_id"] == "SV-12345"
    assert data["candidate"]["iswc"] == "T-123456789-0"
    assert data["candidate"]["status"] == "Reconciled"
    assert len(data["candidate"]["writers"]) == 3
    assert data["candidate"]["writers"][0]["share"] == 33.33
    assert len(data["candidate"]["publishers"]) == 2
    assert data["warnings"] == []
    assert set(data["parsed_fields"]) == {
        "iswc",
        "public_work_id",
        "publishers",
        "status",
        "title",
        "writers",
    }


def test_parse_candidate_returns_warnings_for_missing_fields() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "ASCAP repertory",
            "raw_text": "Title: ONLY A TITLE",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["candidate"]["title"] == "ONLY A TITLE"
    assert "No writers were parsed from the pasted text." in data["warnings"]
    assert "No publishers were parsed from the pasted text." in data["warnings"]
    assert "No ISWC was parsed from the pasted text." in data["warnings"]
