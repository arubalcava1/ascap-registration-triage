from app.schemas import AscapWork, CandidateWork, NormalizedComparison
from app.services.normalizer import (
    normalize_iswc,
    normalize_title,
    normalized_party_names,
)


def build_comparison_details(
    ascap_work: AscapWork,
    candidate: CandidateWork,
) -> NormalizedComparison:
    return NormalizedComparison(
        ascap_title=normalize_title(ascap_work.title),
        candidate_title=normalize_title(candidate.title),
        ascap_iswc=normalize_iswc(ascap_work.iswc) or None,
        candidate_iswc=normalize_iswc(candidate.iswc) or None,
        ascap_writers=normalized_party_names(ascap_work.writers),
        candidate_writers=normalized_party_names(candidate.writers),
        ascap_publishers=normalized_party_names(ascap_work.publishers, publisher=True),
        candidate_publishers=normalized_party_names(candidate.publishers, publisher=True),
    )
