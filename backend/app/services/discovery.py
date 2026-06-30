from app.schemas import (
    AscapWork,
    CandidateDiscoveryAction,
    CandidateDiscoveryResponse,
)


ASCAP_REPERTORY_URL = "https://www.ascap.com/repertory"
BMI_REPERTOIRE_URL = "https://repertoire.bmi.com/"
SONGVIEW_URL = "https://songview.com/"

DISCOVERY_DISCLAIMER = (
    "Discovery actions open public repertoire search pages and prepare search terms. "
    "They do not scrape public sites, access private systems, or guarantee that a candidate match exists."
)


def discover_candidate_actions(ascap_work: AscapWork) -> CandidateDiscoveryResponse:
    title_term = ascap_work.title.strip()
    writer_term = _first_party_name(ascap_work.writers)
    publisher_term = _first_party_name(ascap_work.publishers)
    iswc_term = (ascap_work.iswc or "").strip()
    title_writer_term = " ".join(part for part in [title_term, writer_term] if part)

    possible_actions = [
        CandidateDiscoveryAction(
            source="Songview overview",
            description="Open Songview and choose ASCAP or BMI public repertoire search.",
            url=SONGVIEW_URL,
            search_term=title_writer_term or title_term or iswc_term,
            search_type="title_writer",
        ),
        CandidateDiscoveryAction(
            source="ASCAP repertory",
            description="Search ASCAP public repertory using the title, writer, publisher, or ISWC.",
            url=ASCAP_REPERTORY_URL,
            search_term=title_writer_term or title_term or iswc_term,
            search_type="title_writer",
        ),
        CandidateDiscoveryAction(
            source="BMI / Songview repertoire",
            description="Search BMI's public Songview-enabled repertoire by title, writer, publisher, work ID, or ISWC.",
            url=BMI_REPERTOIRE_URL,
            search_term=title_writer_term or title_term or publisher_term or iswc_term,
            search_type="title_writer",
        ),
    ]

    if iswc_term:
        possible_actions.append(
            CandidateDiscoveryAction(
                source="ISWC lookup",
                description="Use the ISWC when a public source supports identifier search.",
                url=BMI_REPERTOIRE_URL,
                search_term=iswc_term,
                search_type="iswc",
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
