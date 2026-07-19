from fastapi.testclient import TestClient

from app.main import app
from app.services.writer_reference import WriterReference


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
    assert "alex rivera" in data["results"][0]["comparison_details"]["ascap_writers"]

    discrepancy_types = {item["type"] for item in data["results"][0]["discrepancies"]}
    assert "extra_writer" in discrepancy_types
    assert "iswc_missing_from_ascap_metadata" not in discrepancy_types

    assert data["review_decision"]["label"] == "Needs Manual Review"
    assert data["review_decision"]["severity"] == "warning"
    assert data["review_decision"]["confidence_score"] == data["top_result"]["confidence_score"]
    assert data["review_decision"]["rationale"]
    assert "ASCAP Possible Match Review" in data["report_text"]
    assert "ASCAP Work Searched" in data["report_text"]
    assert "Review Decision" in data["report_text"]
    assert "Needs Manual Review" in data["report_text"]
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


def test_blank_user_identifiers_are_not_matching_criteria() -> None:
    payload = {
        "ascap_work": {
            "title": "SANTERIA",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "gaugh", "ipi_cae": None, "share": None},
                {"name": "nowell", "ipi_cae": None, "share": None},
                {"name": "wilson", "ipi_cae": None, "share": None},
            ],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "490865115",
                "iswc": "T0709421237",
                "alternate_titles": [],
                "writers": [
                    {"name": "GAUGH FLOYD I", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                    {"name": "WILSON ERIC JOHN", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            }
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    discrepancy_types = {item["type"] for item in data["top_result"]["discrepancies"]}
    evidence_fields = {item["field"] for item in data["top_result"]["matching_evidence"]}
    assert "iswc_missing_from_ascap_metadata" not in discrepancy_types
    assert "song_code_missing_from_candidate" not in discrepancy_types
    assert "song_code" not in evidence_fields
    assert "iswc" not in evidence_fields
    assert data["top_result"]["confidence_label"] == "Strong Match"


def test_provided_song_code_is_matching_criteria() -> None:
    payload = _payload()
    payload["ascap_work"]["song_code"] = "123456789"
    payload["candidates"][0]["public_work_id"] = "999999999"

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    discrepancy_types = {item["type"] for item in data["results"][0]["discrepancies"]}
    assert "song_code_mismatch" in discrepancy_types


def test_writer_set_quality_breaks_same_title_tie() -> None:
    payload = {
        "ascap_work": {
            "title": "SANTERIA",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "Gaugh Floyd I", "ipi_cae": None, "share": None},
                {"name": "Nowell Bradley James", "ipi_cae": None, "share": None},
                {"name": "Wilson Eric John", "ipi_cae": None, "share": None},
            ],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "490865115",
                "iswc": "T0709421237",
                "alternate_titles": [],
                "writers": [
                    {"name": "Gaugh Floyd I", "ipi_cae": None, "share": None},
                    {"name": "Nowell Bradley James", "ipi_cae": None, "share": None},
                    {"name": "Wilson Eric John", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "920301270",
                "iswc": "T3176629151",
                "alternate_titles": [],
                "writers": [
                    {"name": "Burns Daimon Lashon", "ipi_cae": None, "share": None},
                    {"name": "Nowell Bradley James", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["top_result"]["candidate"]["public_work_id"] == "490865115"
    assert data["results"][0]["confidence_score"] > data["results"][1]["confidence_score"]


def test_writer_last_names_match_full_candidate_writer_names() -> None:
    payload = {
        "ascap_work": {
            "title": "SANTERIA",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "nowell", "ipi_cae": None, "share": None},
                {"name": "gaugh", "ipi_cae": None, "share": None},
                {"name": "wilson", "ipi_cae": None, "share": None},
            ],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "490865115",
                "iswc": "T0709421237",
                "alternate_titles": [],
                "writers": [
                    {"name": "GAUGH FLOYD I", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                    {"name": "WILSON ERIC JOHN", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "920301270",
                "iswc": "T3176629151",
                "alternate_titles": [],
                "writers": [
                    {"name": "BURNS DAIMON LASHON", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["top_result"]["candidate"]["public_work_id"] == "490865115"
    assert data["top_result"]["confidence_label"] == "Strong Match"
    assert data["results"][1]["confidence_label"] != "Strong Match"
    wrong_match_discrepancy_types = {item["type"] for item in data["results"][1]["discrepancies"]}
    assert "extra_writer" in wrong_match_discrepancy_types
    assert "missing_writer" in wrong_match_discrepancy_types


def test_extra_writer_prevents_strong_match_without_confirming_iswc() -> None:
    payload = {
        "ascap_work": {
            "title": "SANTERIA",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "gaugh", "ipi_cae": None, "share": None},
                {"name": "nowell", "ipi_cae": None, "share": None},
                {"name": "wilson", "ipi_cae": None, "share": None},
            ],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "extra-1",
                "iswc": None,
                "alternate_titles": [],
                "writers": [
                    {"name": "GAUGH FLOYD I", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                    {"name": "WILSON ERIC JOHN", "ipi_cae": None, "share": None},
                    {"name": "BURNS DAIMON LASHON", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            }
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["top_result"]["confidence_label"] != "Strong Match"


def test_case_and_last_name_only_writer_match_has_no_name_discrepancy() -> None:
    payload = {
        "ascap_work": {
            "title": "EXAMPLE SONG",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [
                {"name": "williams", "ipi_cae": None, "share": None},
            ],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "EXAMPLE SONG",
                "public_work_id": "12345",
                "iswc": None,
                "alternate_titles": [],
                "writers": [
                    {"name": "WILLIAMS JOHN", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            }
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    discrepancy_types = {item["type"] for item in data["top_result"]["discrepancies"]}
    assert "writer_name_variation" not in discrepancy_types
    assert "missing_writer" not in discrepancy_types
    assert "extra_writer" not in discrepancy_types


def test_external_writer_reference_ranks_complete_ascap_work_first(monkeypatch) -> None:
    def fake_reference_lookup(ascap_work, candidates):
        return WriterReference(
            writers=["Bud Gaugh", "Bradley Nowell", "Eric Wilson"],
            sources=["MusicBrainz"],
            status="found",
            note="Test reference.",
        )

    monkeypatch.setattr(
        "app.services.matcher.maybe_lookup_external_writer_reference",
        fake_reference_lookup,
    )

    payload = {
        "ascap_work": {
            "title": "SANTERIA",
            "song_code": None,
            "iswc": None,
            "alternate_titles": [],
            "writers": [{"name": "nowell", "ipi_cae": None, "share": None}],
            "publishers": [],
            "source_url": None,
            "notes": None,
        },
        "candidates": [
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "920301270",
                "iswc": "T3176629151",
                "alternate_titles": [],
                "writers": [
                    {"name": "BURNS DAIMON LASHON", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                ],
                "publishers": [],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
            {
                "source": "ASCAP Repertory",
                "title": "SANTERIA",
                "public_work_id": "490865115",
                "iswc": "T0709421237",
                "alternate_titles": [],
                "writers": [
                    {"name": "GAUGH FLOYD I", "ipi_cae": None, "share": None},
                    {"name": "NOWELL BRADLEY JAMES", "ipi_cae": None, "share": None},
                    {"name": "WILSON ERIC JOHN", "ipi_cae": None, "share": None},
                ],
                "publishers": [
                    {"name": "ERIC JOHN WILSON PUBLISHING", "ipi_cae": None, "share": None},
                    {"name": "FLOYD I GAUGH IV PUBLISHING", "ipi_cae": None, "share": None},
                    {"name": "GASOLINE ALLEY MUSIC", "ipi_cae": None, "share": None},
                    {"name": "LOU DOG PUBLISHING", "ipi_cae": None, "share": None},
                    {"name": "SONGS OF UNIVERSAL INC", "ipi_cae": None, "share": None},
                ],
                "status": None,
                "source_url": None,
                "raw_notes": None,
            },
        ],
    }

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["top_result"]["candidate"]["public_work_id"] == "490865115"
    assert data["top_result"]["confidence_label"] == "Strong Match"
    assert data["review_decision"]["label"] == "Likely Same Work"
    assert data["external_writer_reference"]["writers"] == [
        "Bud Gaugh",
        "Bradley Nowell",
        "Eric Wilson",
    ]
    top_discrepancy_types = {item["type"] for item in data["top_result"]["discrepancies"]}
    assert "missing_reference_writer" not in top_discrepancy_types
    assert "extra_reference_writer" not in top_discrepancy_types
    assert "extra_publisher" not in top_discrepancy_types
    wrong_result = next(
        result for result in data["results"] if result["candidate"]["public_work_id"] == "920301270"
    )
    discrepancy_types = {item["type"] for item in wrong_result["discrepancies"]}
    assert "missing_reference_writer" in discrepancy_types
    assert "extra_reference_writer" in discrepancy_types
    assert "External Writer Reference" in data["report_text"]


def test_split_style_input_no_longer_drives_share_scoring() -> None:
    payload = _payload()

    response = client.post("/api/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()
    evidence_fields = {item["field"] for item in data["top_result"]["matching_evidence"]}
    discrepancy_types = {item["type"] for item in data["top_result"]["discrepancies"]}
    assert "shares" not in evidence_fields
    assert "writer_share_mismatch" not in discrepancy_types


def _payload() -> dict:
    return {
        "ascap_work": {
            "title": "THE GREATEST",
            "song_code": "123456789",
            "iswc": None,
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
        },
        "candidates": [
            {
                "source": "Songview",
                "title": "GREATEST, THE",
                "public_work_id": "123456789",
                "iswc": "T-123456789-0",
                "alternate_titles": [],
                "writers": [
                    {"name": "Alex Rivera", "ipi_cae": None, "share": 33.33},
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
