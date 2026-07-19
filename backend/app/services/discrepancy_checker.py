from rapidfuzz import fuzz

from app.schemas import AscapWork, CandidateWork, Discrepancy, Party
from app.services.normalizer import (
    normalize_compact_text,
    normalize_identifier,
    normalize_iswc,
    normalize_name,
    normalize_publisher_name,
    normalize_title,
    normalized_party_names,
)
from app.services.writer_reference import WriterReference, candidate_reference_matches


NAME_MATCH_THRESHOLD = 88


def detect_discrepancies(
    ascap_work: AscapWork,
    candidate: CandidateWork,
    writer_reference: WriterReference | None = None,
) -> list[Discrepancy]:
    discrepancies: list[Discrepancy] = []

    discrepancies.extend(_title_discrepancies(ascap_work, candidate))
    discrepancies.extend(_song_code_discrepancies(ascap_work, candidate))
    discrepancies.extend(_iswc_discrepancies(ascap_work, candidate))
    if writer_reference and writer_reference.writers:
        discrepancies.extend(_external_writer_reference_discrepancies(candidate, writer_reference))
    else:
        discrepancies.extend(_party_discrepancies(ascap_work.writers, candidate.writers, "writer"))
    discrepancies.extend(_party_discrepancies(ascap_work.publishers, candidate.publishers, "publisher"))

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


def _external_writer_reference_discrepancies(
    candidate: CandidateWork,
    writer_reference: WriterReference,
) -> list[Discrepancy]:
    _, missing_writers, extra_writers = candidate_reference_matches(candidate, writer_reference)
    discrepancies: list[Discrepancy] = []

    for writer in missing_writers:
        discrepancies.append(
            Discrepancy(
                type="missing_reference_writer",
                severity="high",
                field="external_writers",
                description=f"Candidate is missing public reference writer '{writer}'.",
                suggested_review_note="Review this candidate against the public writer reference before treating it as the likely match.",
            )
        )

    for writer in extra_writers:
        discrepancies.append(
            Discrepancy(
                type="extra_reference_writer",
                severity="high",
                field="external_writers",
                description=f"Candidate includes writer '{writer}' not found in the public writer reference.",
                suggested_review_note="Review whether this public candidate is a different work or alternate registration.",
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
    if not ascap_iswc:
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
    if ascap_iswc and candidate_iswc:
        return []
    return [
        Discrepancy(
            type="iswc_missing_from_candidate",
            severity="low",
            field="iswc",
            description="ASCAP portal metadata includes an ISWC that is not shown in the candidate metadata.",
            suggested_review_note="Review whether the public record is incomplete or a different candidate.",
        )
    ]


def _song_code_discrepancies(ascap_work: AscapWork, candidate: CandidateWork) -> list[Discrepancy]:
    ascap_song_code = normalize_identifier(ascap_work.song_code)
    candidate_public_id = normalize_identifier(candidate.public_work_id)
    if not ascap_song_code:
        return []
    if ascap_song_code and candidate_public_id and ascap_song_code != candidate_public_id:
        return [
            Discrepancy(
                type="song_code_mismatch",
                severity="high",
                field="song_code",
                description="ASCAP song code and candidate public work ID are different.",
                suggested_review_note="Verify the ASCAP song code against the public work ID before treating this candidate as a match.",
            )
        ]
    if ascap_song_code and candidate_public_id:
        return []
    return [
        Discrepancy(
            type="song_code_missing_from_candidate",
            severity="low",
            field="song_code",
            description="ASCAP metadata includes a song code that is not shown in the candidate metadata.",
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

    if not ascap_names:
        return []

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
        elif ascap_name != match_name and not _is_token_subset_match(ascap_name, match_name):
            discrepancies.append(
                Discrepancy(
                    type=f"{party_type}_name_variation",
                    severity="low",
                    field=field,
                    description=f"{party_type.title()} name appears similar but formatted differently: '{ascap_display[ascap_name]}' and '{candidate_display[match_name]}'.",
                    suggested_review_note=f"Review whether these {party_type} names refer to the same party.",
                )
            )

    if party_type == "writer" and len(normalized_party_names(ascap_parties)) == 1:
        discrepancies.extend(_ipi_discrepancies(ascap_parties, candidate_parties, party_type))
        return discrepancies

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
    compact_score = _compact_name_similarity(left, right)
    if compact_score:
        return compact_score

    left_tokens = _name_tokens(left)
    right_tokens = _name_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    if left_tokens <= right_tokens or right_tokens <= left_tokens:
        return 100.0
    if _shared_distinctive_tokens_match(left_tokens, right_tokens):
        return 100.0
    return float(fuzz.token_sort_ratio(left, right))


def _compact_name_similarity(left: str, right: str) -> float:
    left_compact = normalize_compact_text(left)
    right_compact = normalize_compact_text(right)
    if not left_compact or not right_compact:
        return 0.0
    if left_compact == right_compact:
        return 100.0
    if min(len(left_compact), len(right_compact)) >= 4 and (
        left_compact in right_compact or right_compact in left_compact
    ):
        return 100.0
    if min(len(left_compact), len(right_compact)) >= 3 and fuzz.ratio(left_compact, right_compact) >= 85:
        return 100.0
    return 0.0


def _is_token_subset_match(left: str, right: str) -> bool:
    left_tokens = _name_tokens(left)
    right_tokens = _name_tokens(right)
    if left_tokens and right_tokens and (left_tokens <= right_tokens or right_tokens <= left_tokens):
        return True
    return bool(_compact_name_similarity(left, right))


def _name_tokens(value: str) -> set[str]:
    return {token for token in value.split() if len(token) > 1}


def _shared_distinctive_tokens_match(left_tokens: set[str], right_tokens: set[str]) -> bool:
    shared_tokens = {token for token in left_tokens & right_tokens if len(token) >= 3}
    return len(shared_tokens) >= 2
