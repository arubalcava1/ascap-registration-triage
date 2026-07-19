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
Alex Rivera | 33.33%
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
    assert data["candidate"]["writers"][0]["share"] is None
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


def test_parse_candidate_from_bmi_repertoire_detail_text() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "BMI Repertoire",
            "raw_text": """
Title
SANTERIA
BMI Work ID 3800344
SV Status Reconciled
ISWC
T0709421237
Writers / Composers
GAUGH FLOYD I BMI 00196147445
NOWELL BRADLEY JAMES BMI 00183755932
WILSON ERIC JOHN BMI 00196150560
Publishers
ERIC JOHN WILSON PUBLISHING BMI 00196381143
FLOYD I GAUGH IV PUBLISHING BMI 00196381339
GASOLINE ALLEY MUSIC BMI 0018019076
LOU DOG PUBLISHING BMI 00183746051
SONGS OF UNIVERSAL INC BMI 00353271280
Performers
SUBLIME
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "SANTERIA"
    assert data["candidate"]["public_work_id"] == "3800344"
    assert data["candidate"]["iswc"] == "T0709421237"
    assert data["candidate"]["status"] == "Reconciled"
    assert len(data["candidate"]["writers"]) == 3
    assert data["candidate"]["writers"][0]["name"] == "GAUGH FLOYD I"
    assert data["candidate"]["writers"][0]["ipi_cae"] == "00196147445"
    assert len(data["candidate"]["publishers"]) == 5
    assert data["candidate"]["publishers"][0]["name"] == "ERIC JOHN WILSON PUBLISHING"
    assert data["warnings"] == []


def test_parse_candidate_from_bmi_copied_table_selection() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "Songview",
            "raw_text": """
Title BMI Work ID SV Status Writer / Composer Performer Expand
BMI Award Winning Song
GREATEST AMERICAN HERO 102809
GEYER STEPHEN G
POST MIKE
TOTAL %
CONTROLLED
BMI 93.75%
ASCAP 0%
WORK ID 102809
ISWC
T9303796998
Writers / Composers
% CONTROLLED BMI: 50%
NAME AFFILIATION IPI #
GEYER STEPHEN G BMI 66901174
POST MIKE BMI 24768767
Performers
BEECHMAN LAURIE
JOEY SCARBURY
MARK STAN
Publishers
% CONTROLLED BMI: 43.75%
NAME AFFILIATION IPI #
DARJEN MUSIC BMI 60805791
EMI BLACKWOOD MUSIC INC BMI 223437493
STEPHEN CANNELL MUSIC BMI 52437494
Additional Non-BMI Publishers
Alternate Titles
BELIEVE IT OR NOT
MAIN TITLE FROM TV SHOW THE GREATEST AMERICAN HERO
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "GREATEST AMERICAN HERO"
    assert data["candidate"]["public_work_id"] == "102809"
    assert data["candidate"]["iswc"] == "T9303796998"
    assert [writer["name"] for writer in data["candidate"]["writers"]] == [
        "GEYER STEPHEN G",
        "POST MIKE",
    ]
    assert [publisher["name"] for publisher in data["candidate"]["publishers"]] == [
        "DARJEN MUSIC",
        "EMI BLACKWOOD MUSIC INC",
        "STEPHEN CANNELL MUSIC",
    ]
    assert all(writer["name"] != ":" for writer in data["candidate"]["writers"])
    assert all(publisher["name"] != ":" for publisher in data["candidate"]["publishers"])
    assert "No ISWC was parsed from the pasted text." not in data["warnings"]


def test_parse_candidate_does_not_infer_performer_header_as_title() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "Songview",
            "raw_text": """
Performer
ISWC
T3369942774
Writers
GEYER STEPHEN G
POST MIKE
Publishers
DARJEN MUSIC
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] != "Performer"
    assert "Could not confidently parse a title." in data["warnings"]


def test_parse_candidate_from_ascap_copied_result_selection() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "ASCAP Repertory",
            "raw_text": """
THE GREATEST
ISWC: T9019887935
Work ID: 423537515
Total Current ASCAP Share: 100%
Total Current BMI Share: 0%
Songview Logo
Writers
ASCAP controls: 50% BMI controls: 0%
PRO IPI
ALIYU IBRAHIM BOLAJI ASCAP 556833128
Performers
WORLDSTAR
Publishers
ASCAP controls: 50% BMI controls: 0%
PRO IPI
WORLD WIDE VISIONARYENTERTAINMENT INC ASCAP 556798195
Contact Info
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "THE GREATEST"
    assert data["candidate"]["public_work_id"] == "423537515"
    assert data["candidate"]["iswc"] == "T9019887935"
    assert data["candidate"]["status"] is None
    assert data["candidate"]["writers"] == [
        {
            "name": "ALIYU IBRAHIM BOLAJI",
            "ipi_cae": "556833128",
            "share": None,
        }
    ]
    assert data["candidate"]["publishers"] == [
        {
            "name": "WORLD WIDE VISIONARYENTERTAINMENT INC",
            "ipi_cae": "556798195",
            "share": None,
        }
    ]


def test_parse_candidate_from_ascap_label_without_colon() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "ASCAP Repertory",
            "raw_text": """
Title THE GREATEST
ISWC T9019887935
Work ID 423537515
Writers
ALIYU IBRAHIM BOLAJI ASCAP 556833128
Publishers
WORLD WIDE VISIONARYENTERTAINMENT INC ASCAP 556798195
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "THE GREATEST"
    assert data["candidate"]["public_work_id"] == "423537515"
    assert data["candidate"]["iswc"] == "T9019887935"
    assert data["candidate"]["writers"][0]["name"] == "ALIYU IBRAHIM BOLAJI"
    assert data["candidate"]["publishers"][0]["name"] == "WORLD WIDE VISIONARYENTERTAINMENT INC"


def test_parse_candidate_from_real_ascap_santeria_block() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "ASCAP Repertory",
            "raw_text": """
SANTERIA
ISWC: T0709421237
Work ID: 490865115
Total Current ASCAP Share: 0%
Total Current BMI Share: 100%
Writers
ASCAP controls: 0% BMI controls: 50%
PRO IPI
GAUGH FLOYD I BMI 196147445
NOWELL BRADLEY JAMES BMI 183755932
WILSON ERIC JOHN BMI 196150560
Performers
SUBLIME
Publishers
ASCAP controls: 0% BMI controls: 50%
PRO IPI
ERIC JOHN WILSON PUBLISHING BMI 196381143
FLOYD I GAUGH IV PUBLISHING BMI 196381339
GASOLINE ALLEY MUSIC BMI 18019776
LOU DOG PUBLISHING BMI 183746051
SONGS OF UNIVERSAL INC BMI 353271280
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "SANTERIA"
    assert data["candidate"]["public_work_id"] == "490865115"
    assert data["candidate"]["iswc"] == "T0709421237"
    assert [writer["name"] for writer in data["candidate"]["writers"]] == [
        "GAUGH FLOYD I",
        "NOWELL BRADLEY JAMES",
        "WILSON ERIC JOHN",
    ]
    assert data["candidate"]["publishers"][0]["name"] == "ERIC JOHN WILSON PUBLISHING"
    assert data["warnings"] == []


def test_parse_candidate_filters_common_ascap_artifacts() -> None:
    response = client.post(
        "/api/parse-candidate",
        json={
            "source": "ASCAP Repertory",
            "raw_text": """
SANTERIA
ISWC: T3176629151
Work ID: 920301270
Total Current ASCAP Share: 0%
Total Current BMI Share: 100%
Writers
ASCAP controls: 0% BMI controls: 50%
PRO IPI
BURNS DAIMON LASHON BMI 123456789
NOWELL BRADLEY JAMES BMI 183755932
Performers
SUBLIME
Publishers
No Information Found
Additional Info
Contact Info
Print
Collapse
""",
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["candidate"]["title"] == "SANTERIA"
    assert data["candidate"]["public_work_id"] == "920301270"
    assert data["candidate"]["iswc"] == "T3176629151"
    assert [writer["name"] for writer in data["candidate"]["writers"]] == [
        "BURNS DAIMON LASHON",
        "NOWELL BRADLEY JAMES",
    ]
    assert data["candidate"]["publishers"] == []
    assert "No publishers were parsed from the pasted text." in data["warnings"]
