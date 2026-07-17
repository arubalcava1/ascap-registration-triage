from urllib.parse import quote, urlencode

from app.schemas import (
    AscapWork,
    CandidateDiscoveryAction,
    CandidateDiscoveryResponse,
)


ASCAP_REPERTORY_URL = "https://www.ascap.com/repertory"
BMI_REPERTOIRE_URL = "https://repertoire.bmi.com/"
BMI_SEARCH_URL = "https://repertoire.bmi.com/Search/Search"
DISCOVERY_DISCLAIMER = (
    "Discovery actions open public repertoire search pages and prepare search terms. "
    "They do not scrape public sites, access private systems, or guarantee that a candidate match exists."
)


def discover_candidate_actions(
    ascap_work: AscapWork,
    performer: str | None = None,
) -> CandidateDiscoveryResponse:
    title_term = ascap_work.title.strip()
    performer_term = (performer or "").strip()
    writer_term = _first_party_name(ascap_work.writers)
    publisher_term = _first_party_name(ascap_work.publishers)
    iswc_term = (ascap_work.iswc or "").strip()
    title_writer_term = " ".join(part for part in [title_term, writer_term] if part)
    ascap_title_url = _ascap_title_url(title_term, performer_term)
    bmi_title_url = _bmi_search_url("Title", title_term)
    bmi_iswc_url = _bmi_search_url("ISWC", iswc_term)

    possible_actions = [
        CandidateDiscoveryAction(
            source="ASCAP repertory",
            description="Search ASCAP public repertory using separate title and performer fields.",
            url=ascap_title_url or ASCAP_REPERTORY_URL,
            search_term=_field_summary(_fields(title=title_term, performer=performer_term)) or title_term or iswc_term,
            search_type="title_performer",
            search_fields=_fields(title=title_term, performer=performer_term),
        ),
        CandidateDiscoveryAction(
            source="BMI / Songview repertoire",
            description="Search BMI's public repertoire using separate title and performer fields, then choose Songview or BMI Repertoire.",
            url=bmi_title_url or BMI_REPERTOIRE_URL,
            search_term=_field_summary(_fields(title=title_term, performer=performer_term))
            or title_writer_term
            or title_term
            or publisher_term
            or iswc_term,
            search_type="title_performer",
            search_fields=_fields(title=title_term, performer=performer_term, mode="BMI Repertoire"),
        ),
    ]

    if iswc_term:
        possible_actions.append(
            CandidateDiscoveryAction(
                source="ISWC lookup",
                description="Use the ISWC when a public source supports identifier search.",
                url=bmi_iswc_url or BMI_REPERTOIRE_URL,
                search_term=iswc_term,
                search_type="iswc",
                search_fields={"iswc": iswc_term},
            )
        )

    actions = [action for action in possible_actions if action.search_term]
    return CandidateDiscoveryResponse(
        actions=actions,
        summary=f"Prepared {len(actions)} public repertoire discovery action(s).",
        disclaimer=DISCOVERY_DISCLAIMER,
    )


def _first_party_name(parties) -> str:
    for party in parties:
        if party.name.strip():
            return party.name.strip()
    return ""


def _ascap_title_url(title: str, performer: str) -> str:
    if not title:
        return ""
    title_path = f"{ASCAP_REPERTORY_URL}#/ace/search/title/{quote(title)}"
    if not performer:
        return f"{title_path}?at=false&searchFilter=SVW&page=1"
    return (
        f"{title_path}/"
        f"performer/{quote(performer)}?at=false&searchFilter=SVW&page=1"
    )


def _bmi_search_url(search_type: str, search_text: str) -> str:
    if not search_text:
        return ""
    query = urlencode(
        {
            "Main_Search_Text": search_text,
            "Main_Search": search_type,
            "View_Count": "20",
            "Page_Number": "1",
        }
    )
    return f"{BMI_SEARCH_URL}?{query}"


def _fields(**values: str) -> dict[str, str]:
    return {key: value for key, value in values.items() if value}


def _field_summary(fields: dict[str, str]) -> str:
    return "; ".join(f"{key.title()}: {value}" for key, value in fields.items())
