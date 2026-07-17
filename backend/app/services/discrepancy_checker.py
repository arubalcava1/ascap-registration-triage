from rapidfuzz import fuzz

from app.schemas import AscapWork, CandidateWork, Discrepancy, Party
from app.services.normalizer import (
    normalize_iswc,
    normalize_name,
    normalize_publisher_name,
    normalize_title,
    normalized_party_names,
    shares_by_normalized_name,
)


NAME_MATCH_THRESHOLD = 88


def detect_discrepancies(ascap_work: AscapWork, candidate: CandidateWork) -> list[Discrepancy]:
    discrepancies: list[Discrepancy] = []

    discrepancies.extend(_title_discrepancies(ascap_work, candidate))
    discrepancies.extend(_iswc_discrepancies(ascap_work, candidate))
    discrepancies.extend(_party_discrepancies(ascap_work.writers, candidate.writers, "writer"))
    discrepancies.extend(_party_discrepancies(ascap_work.publishers, candidate.publishers, "publisher"))
    discrepancies.extend(_share_discrepancies(ascap_work, candidate))

    if candidate.status:
        discrepancies.append(
            Discrepancy(
                type="candidate_status_note",
                severity="low",
                field="status",
                description=f"Candidate status is listed as '{candidate.status}'.",
                suggested_review_note="Review the public status indicator in the source record.",
            )
        )

    return discrepancies


def _title_discrepancies(ascap_work: AscapWork, candidate: CandidateWork) -> list[Discrepancy]:
    ascap_title = normalize_title(ascap_work.title)
    candidate_title = normalize_title(candidate.title)
    if not ascap_title or not candidate_title or ascap_title == candidate_title:
        return []

    similarity = fuzz.token_sort_ratio(ascap_title, candidate_title)
    if similarity >= NAME_MATCH_THRESHOLD:
        return [
            Discrepancy(
                type="title_formatting_difference",
                severity="low",
                field="title",
                description="Candidate title appears similar but is formatted differently.",
                suggested_review_note="Review title formatting and alternate title fields.",
            )
        ]

    return [
        Discrepancy(
            type="title_difference",
            severity="medium",
            field="title",
            description="Candidate title differs from the ASCAP portal title.",
            suggested_review_note="Confirm whether the candidate is an alternate title or a different work.",
        )
    ]


def _iswc_discrepancies(ascap_work: AscapWork, candidate: CandidateWork) -> list[Discrepancy]:
    ascap_iswc = normalize_iswc(ascap_work.iswc)
    candidate_iswc = normalize_iswc(candidate.iswc)
    if not ascap_iswc and not candidate_iswc:
        return []
    if ascap_iswc and candidate_iswc and ascap_iswc != candidate_iswc:
        return [
            Discrepancy(
                type="iswc_mismatch",
                severity="high",
                field="iswc",
                description="ASCAP portal metadata and candidate metadata show different ISWC values.",
                suggested_review_note="Verify the ISWC in both records before treating this candidate as a match.",
            )
        ]
    if not ascap_iswc and candidate_iswc:
        return [
            Discrepancy(
                type="iswc_missing_from_ascap_metadata",
                severity="low",
                field="iswc",
                description="Candidate includes an ISWC not shown in the ASCAP portal metadata provided.",
                suggested_review_note="Review whether the public ISWC belongs to the work under investigation.",
            )
        ]
    return [
        Discrepancy(
            type="iswc_missing_from_candidate",
            severity="low",
            field="iswc",
            description="ASCAP portal metadata includes an ISWC that is not shown in the candidate metadata.",
            suggested_review_note="Review whether the public record is incomplete or a different candidate.",
        )
    ]


def _party_discrepancies(
    ascap_parties: list[Party],
    candidate_parties: list[Party],
    party_type: str,
) -> list[Discrepancy]:
    publisher = party_type == "publisher"
    normalizer = normalize_publisher_name if publisher else normalize_name
    field = f"{party_type}s"
    discrepancies: list[Discrepancy] = []

    ascap_names = [normalizer(party.name) for party in ascap_parties]
    candidate_names = [normalizer(party.name) for party in candidate_parties]
    ascap_display = {normalizer(party.name): party.name for party in ascap_parties}
    candidate_display = {normalizer(party.name): party.name for party in candidate_parties}

    for ascap_name in normalized_party_names(ascap_parties, publisher=publisher):
        match_name, match_score = _best_name_match(ascap_name, candidate_names)
        if not match_name or match_score < NAME_MATCH_THRESHOLD:
            discrepancies.append(
                Discrepancy(
                    type=f"missing_{party_type}",
                    severity="high" if party_type == "writer" else "medium",
                    field=field,
                    description=f"ASCAP metadata includes {party_type} '{ascap_display[ascap_name]}' not clearly found in the candidate.",
                    suggested_review_note=f"Review whether this {party_type} is missing from the candidate record or listed under a variation.",
                )
            )
        elif ascap_name != match_name:
            discrepancies.append(
                Discrepancy(
                    type=f"{party_type}_name_variation",
                    severity="low",
                    field=field,
                    description=f"{party_type.title()} name appears similar but formatted differently: '{ascap_display[ascap_name]}' and '{candidate_display[match_name]}'.",
                    suggested_review_note=f"Review whether these {party_type} names refer to the same party.",
                )
            )

    for candidate_name in normalized_party_names(candidate_parties, publisher=publisher):
        match_name, match_score = _best_name_match(candidate_name, ascap_names)
        if not match_name or match_score < NAME_MATCH_THRESHOLD:
            discrepancies.append(
                Discrepancy(
                    type=f"extra_{party_type}",
                    severity="high" if party_type == "writer" else "medium",
                    field=field,
                    description=f"Candidate includes additional {party_type} '{candidate_display[candidate_name]}' not clearly found in the ASCAP metadata.",
                    suggested_review_note=f"Review whether this additional {party_type} should be associated with the work.",
                )
            )

    discrepancies.extend(_ipi_discrepancies(ascap_parties, candidate_parties, party_type))
    return discrepancies


def _ipi_discrepancies(
    ascap_parties: list[Party],
    candidate_parties: list[Party],
    party_type: str,
) -> list[Discrepancy]:
    discrepancies: list[Discrepancy] = []
    for ascap_party in ascap_parties:
        ascap_name = normalize_name(ascap_party.name)
        if not ascap_party.ipi_cae:
            continue
        for candidate_party in candidate_parties:
            candidate_name = normalize_name(candidate_party.name)
            if _name_similarity(ascap_name, candidate_name) >= NAME_MATCH_THRESHOLD:
                if candidate_party.ipi_cae and candidate_party.ipi_cae != ascap_party.ipi_cae:
                    discrepancies.append(
                        Discrepancy(
                            type=f"{party_type}_ipi_cae_mismatch",
                            severity="high",
                            field=f"{party_type}s",
                            description=f"{party_type.title()} '{ascap_party.name}' has different IPI/CAE values across records.",
                            suggested_review_note="Verify IPI/CAE values against the source records.",
                        )
                    )
    return discrepancies


def _best_name_match(name: str, candidates: list[str]) -> tuple[str | None, float]:
    if not candidates:
        return None, 0.0
    scored = [(candidate, _name_similarity(name, candidate)) for candidate in candidates]
    return max(scored, key=lambda item: item[1])


def _name_similarity(left: str, right: str) -> float:
    left_tokens = _name_tokens(left)
    right_tokens = _name_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    if left_tokens <= right_tokens or right_tokens <= left_tokens:
        return 100.0
    return float(fuzz.token_sort_ratio(left, right))


def _name_tokens(value: str) -> set[str]:
    return {token for token in value.split() if len(token) > 1}


def _share_discrepancies(ascap_work: AscapWork, candidate: CandidateWork) -> list[Discrepancy]:
    discrepancies: list[Discrepancy] = []
    discrepancies.extend(_share_discrepancies_for_parties(ascap_work.writers, candidate.writers, "writer"))
    discrepancies.extend(
        _share_discrepancies_for_parties(ascap_work.publishers, candidate.publishers, "publisher")
    )
    return discrepancies


def _share_discrepancies_for_parties(
    ascap_parties: list[Party],
    candidate_parties: list[Party],
    party_type: str,
) -> list[Discrepancy]:
    publisher = party_type == "publisher"
    ascap_shares = shares_by_normalized_name(ascap_parties, publisher=publisher)
    candidate_shares = shares_by_normalized_name(candidate_parties, publisher=publisher)
    discrepancies: list[Discrepancy] = []

    for name in set(ascap_shares) & set(candidate_shares):
        difference = abs(ascap_shares[name] - candidate_shares[name])
        if difference >= 0.01:
            discrepancies.append(
                Discrepancy(
                    type=f"{party_type}_share_mismatch",
                    severity="medium",
                    field=f"{party_type}_shares",
                    description=f"{party_type.title()} share differs for '{name}': ASCAP metadata has {ascap_shares[name]}%, candidate has {candidate_shares[name]}%.",
                    suggested_review_note="Review ownership share values in both records.",
                )
            )

    return discrepancies
