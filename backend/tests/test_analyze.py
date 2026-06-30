from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_ranks_candidates_and_detects_discrepancies() -> None:
    response = client.post("/api/analyze", json=_payload())

    assert response.status_code == 200
    data = response.json()

    assert len(data["results"]) == 2
    assert data["top_result"]["candidate"]["title"] == "GREATEST, THE"
    assert data["top_result"]["rank"] == 1
    assert data["results"][0]["confidence_score"] > data["results"][1]["confidence_score"]
    assert data["results"][0]["confidence_label"] in {"Strong Match", "Possible Match"}
    assert data["results"][0]["comparison_details"]["ascap_title"] == "the greatest"
    assert data["results"][0]["comparison_details"]["candidate_title"] == "the greatest"
    assert "andrew rubalcava" in data["results"][0]["comparison_details"]["ascap_writers"]

    discrepancy_types = {item["type"] for item in data["results"][0]["discrepancies"]}
    assert "extra_writer" in discrepancy_types
    assert "iswc_missing_from_ascap_metadata" in discrepancy_types
    assert "writer_share_mismatch" in discrepancy_types

    assert "ASCAP Registration Triage Report" in data["report_text"]
    assert "Top Candidate" in data["report_text"]
    assert "GREATEST, THE" in data["report_text"]
    assert "official ASCAP determination" in data["disclaimer"]


def test_empty_candidates_returns_validation_error() -> None:
    payload = _payload()
    payload["candidates"] = []

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 422


def test_missing_iswc_does_not_block_analysis() -> None:
    payload = _payload()
    payload["candidates"][0]["iswc"] = None

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["top_result"]["candidate"]["title"] == "GREATEST, THE"


def _payload() -> dict:
    return {
        "ascap_work": {
            "title": "THE GREATEST",
            "song_code": "123456789",
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "Andrew Rubalcava", "ipi_cae": None, "share": 50},
                {"name": "Jane Smith", "ipi_cae": None, "share": 50},
            ],
            "publishers": [
                {"name": "Example Publishing", "ipi_cae": None, "share": 100}
            ],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "Songview",
                "title": "GREATEST, THE",
                "public_work_id": "SV-12345",
                "iswc": "T-123456789-0",
                "alternate_titles": [],
                "writers": [
                    {"name": "Andrew Rubalcava", "ipi_cae": None, "share": 33.33},
                    {"name": "Jane Smith", "ipi_cae": None, "share": 33.33},
                    {"name": "Mark Lee", "ipi_cae": None, "share": 33.34},
                ],
                "publishers": [
                    {"name": "Example Publishing", "ipi_cae": None, "share": None},
                    {"name": "Other Music Publishing", "ipi_cae": None, "share": None},
                ],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
            {
                "source": "BMI Repertoire",
                "title": "UNRELATED WORK",
                "public_work_id": "BMI-999",
                "iswc": None,
                "alternate_titles": [],
                "writers": [
                    {"name": "Different Writer", "ipi_cae": None, "share": 100}
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
        ],
    }
