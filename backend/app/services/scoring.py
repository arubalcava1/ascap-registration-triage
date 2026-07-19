from rapidfuzz import fuzz, process

from app.schemas import AscapWork, CandidateWork, MatchingEvidence
from app.services.normalizer import (
    normalize_identifier,
    normalize_iswc,
    normalize_title,
    normalized_ipis,
    normalized_party_names,
)
from app.services.writer_reference import WriterReference, candidate_reference_matches


TITLE_WEIGHT = 20.0
SONG_CODE_WEIGHT = 20.0
ISWC_WEIGHT = 20.0
WRITER_IPI_WEIGHT = 20.0
WRITER_NAME_WEIGHT = 35.0
PUBLISHER_WEIGHT = 10.0
REFERENCE_WRITER_WEIGHT = 45.0


def confidence_label(score: float) -> str:
    if score >= 85:
        return "Strong Match"
    if score >= 65:
        return "Possible Match"
    if score >= 40:
        return "Weak Match"
    return "Needs Manual Review"


def best_name_similarity(name: str, candidates: str) -> float:
    return _name_similarity(name, candidates)


def score_candidate(
    ascap_work: AscapWork,
    candidate: CandidateWork,
    writer_reference: WriterReference | None = None,
) -> tuple[float, list[MatchingEvidence]]:
    evidence: list[MatchingEvidence] = []
    weighted_scores: list[tuple[float, float]] = []

    title_score = _score_title(ascap_work, candidate)
    _add_evidence(evidence, "title", title_score, TITLE_WEIGHT, "Title similarity supports this candidate")
    weighted_scores.append((title_score, TITLE_WEIGHT))

    if _has_ascap_song_code(ascap_work):
        song_code_score = _score_song_code(ascap_work, candidate)
        _add_evidence(evidence, "song_code", song_code_score, SONG_CODE_WEIGHT, "ASCAP song code comparison supports this candidate")
        weighted_scores.append((song_code_score, SONG_CODE_WEIGHT))

    if _has_ascap_iswc(ascap_work):
        iswc_score = _score_iswc(ascap_work, candidate)
        _add_evidence(evidence, "iswc", iswc_score, ISWC_WEIGHT, "ISWC comparison supports this candidate")
        weighted_scores.append((iswc_score, ISWC_WEIGHT))

    if _has_comparable_ipis(ascap_work.writers, candidate.writers):
        writer_ipi_score = _score_ipi_overlap(ascap_work.writers, candidate.writers)
        _add_evidence(evidence, "writer_ipi_cae", writer_ipi_score, WRITER_IPI_WEIGHT, "Writer IPI/CAE overlap supports this candidate")
        weighted_scores.append((writer_ipi_score, WRITER_IPI_WEIGHT))

    writer_name_score = _score_party_name_overlap(ascap_work.writers, candidate.writers)
    _add_evidence(evidence, "writers", writer_name_score, WRITER_NAME_WEIGHT, "Writer name similarity supports this candidate")
    weighted_scores.append((writer_name_score, WRITER_NAME_WEIGHT))

    if writer_reference and writer_reference.writers:
        reference_writer_score = _score_reference_writer_match(candidate, writer_reference)
        _add_evidence(
            evidence,
            "external_writers",
            reference_writer_score,
            REFERENCE_WRITER_WEIGHT,
            "Public writer reference supports this candidate",
        )
        weighted_scores.append((reference_writer_score, REFERENCE_WRITER_WEIGHT))

    if ascap_work.publishers:
        publisher_score = max(
            _score_party_name_overlap(ascap_work.publishers, candidate.publishers, publisher=True),
            _score_ipi_overlap(ascap_work.publishers, candidate.publishers),
        )
        _add_evidence(evidence, "publishers", publisher_score, PUBLISHER_WEIGHT, "Publisher similarity supports this candidate")
        weighted_scores.append((publisher_score, PUBLISHER_WEIGHT))

    available_weight = sum(weight for _, weight in weighted_scores)
    if available_weight == 0:
        return 0.0, evidence

    total = sum(score * weight for score, weight in weighted_scores) / available_weight * 100
    total = max(0.0, total - _writer_set_penalty(ascap_work, candidate, writer_reference))

    return round(total, 2), evidence


def _has_comparable_iswc(ascap_work: AscapWork, candidate: CandidateWork) -> bool:
    return bool(normalize_iswc(ascap_work.iswc) and normalize_iswc(candidate.iswc))


def _has_ascap_iswc(ascap_work: AscapWork) -> bool:
    return bool(normalize_iswc(ascap_work.iswc))


def _has_ascap_song_code(ascap_work: AscapWork) -> bool:
    return bool(normalize_identifier(ascap_work.song_code))


def _has_comparable_ipis(ascap_parties, candidate_parties) -> bool:
    return bool(normalized_ipis(ascap_parties) and normalized_ipis(candidate_parties))


def _score_title(ascap_work: AscapWork, candidate: CandidateWork) -> float:
    ascap_titles = [ascap_work.title, *ascap_work.alternate_titles]
    candidate_titles = [candidate.title, *candidate.alternate_titles]
    normalized_ascap = [normalize_title(title) for title in ascap_titles if normalize_title(title)]
    normalized_candidate = [normalize_title(title) for title in candidate_titles if normalize_title(title)]

    if not normalized_ascap or not normalized_candidate:
        return 0.0

    best = 0.0
    for title in normalized_ascap:
        match = process.extractOne(title, normalized_candidate, scorer=fuzz.token_sort_ratio)
        if match:
            best = max(best, match[1] / 100)
    return best


def _score_iswc(ascap_work: AscapWork, candidate: CandidateWork) -> float:
    ascap_iswc = normalize_iswc(ascap_work.iswc)
    candidate_iswc = normalize_iswc(candidate.iswc)
    if not ascap_iswc or not candidate_iswc:
        return 0.0
    return 1.0 if ascap_iswc == candidate_iswc else 0.0


def _score_song_code(ascap_work: AscapWork, candidate: CandidateWork) -> float:
    ascap_song_code = normalize_identifier(ascap_work.song_code)
    candidate_public_id = normalize_identifier(candidate.public_work_id)
    if not ascap_song_code or not candidate_public_id:
        return 0.0
    return 1.0 if ascap_song_code == candidate_public_id else 0.0


def _score_ipi_overlap(ascap_parties, candidate_parties) -> float:
    ascap_ipis = normalized_ipis(ascap_parties)
    candidate_ipis = normalized_ipis(candidate_parties)
    if not ascap_ipis or not candidate_ipis:
        return 0.0
    return len(ascap_ipis & candidate_ipis) / len(ascap_ipis | candidate_ipis)


def _score_party_name_overlap(ascap_parties, candidate_parties, *, publisher: bool = False) -> float:
    ascap_names = normalized_party_names(ascap_parties, publisher=publisher)
    candidate_names = normalized_party_names(candidate_parties, publisher=publisher)
    if not ascap_names or not candidate_names:
        return 0.0

    recall_scores = []
    for name in ascap_names:
        recall_scores.append(_best_name_similarity(name, candidate_names))

    precision_scores = []
    for name in candidate_names:
        precision_scores.append(_best_name_similarity(name, ascap_names))

    recall = sum(recall_scores) / len(recall_scores)
    precision = sum(precision_scores) / len(precision_scores)
    recall_weight = 0.65 if not publisher else 0.55
    return (recall * recall_weight) + (precision * (1 - recall_weight))


def _score_reference_writer_match(candidate: CandidateWork, writer_reference: WriterReference) -> float:
    matched, missing, extra = candidate_reference_matches(candidate, writer_reference)
    expected_count = len(writer_reference.writers)
    candidate_count = len(normalized_party_names(candidate.writers))
    if expected_count == 0 or candidate_count == 0:
        return 0.0

    recall = len(matched) / expected_count
    precision = max(0.0, 1.0 - (len(extra) / max(candidate_count, 1)))
    missing_penalty = len(missing) / expected_count
    return max(0.0, min(1.0, (recall * 0.75) + (precision * 0.25) - (missing_penalty * 0.35)))


def _writer_set_penalty(
    ascap_work: AscapWork,
    candidate: CandidateWork,
    writer_reference: WriterReference | None = None,
) -> float:
    if writer_reference and writer_reference.writers:
        _, missing_reference_writers, extra_reference_writers = candidate_reference_matches(candidate, writer_reference)
        expected_count = max(len(writer_reference.writers), 1)
        candidate_count = max(len(candidate.writers), 1)
        return (len(missing_reference_writers) / expected_count * 55.0) + (
            len(extra_reference_writers) / candidate_count * 50.0
        )

    ascap_names = normalized_party_names(ascap_work.writers)
    candidate_names = normalized_party_names(candidate.writers)
    if not ascap_names or not candidate_names:
        return 0.0

    missing_ratio = _low_match_ratio(ascap_names, candidate_names)
    extra_ratio = _low_match_ratio(candidate_names, ascap_names)
    exact_iswc_match = _has_comparable_iswc(ascap_work, candidate) and _score_iswc(ascap_work, candidate) == 1.0
    extra_penalty = 20.0 if exact_iswc_match else 70.0
    return (missing_ratio * 45.0) + (extra_ratio * extra_penalty)


def _low_match_ratio(source_names: list[str], target_names: list[str]) -> float:
    low_matches = sum(1 for name in source_names if _best_name_similarity(name, target_names) < 0.88)
    return low_matches / len(source_names)


def _best_name_similarity(name: str, candidates: list[str]) -> float:
    if not candidates:
        return 0.0
    return max(_name_similarity(name, candidate) for candidate in candidates)


def _name_similarity(left: str, right: str) -> float:
    left_tokens = _name_tokens(left)
    right_tokens = _name_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    if left_tokens <= right_tokens or right_tokens <= left_tokens:
        return 1.0
    return fuzz.token_sort_ratio(left, right) / 100


def _name_tokens(value: str) -> set[str]:
    return {token for token in value.split() if len(token) > 1}


def _add_evidence(
    evidence: list[MatchingEvidence],
    field: str,
    normalized_score: float,
    weight: float,
    description: str,
) -> None:
    impact = round(normalized_score * weight, 2)
    if impact > 0:
        evidence.append(
            MatchingEvidence(
                field=field,
                description=description,
                score_impact=impact,
            )
        )
