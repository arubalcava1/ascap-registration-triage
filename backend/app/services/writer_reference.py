from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

import httpx
from rapidfuzz import fuzz

from app.schemas import AscapWork, CandidateWork, ExternalWriterReference
from app.services.normalizer import normalize_title, normalized_party_names


REQUEST_TIMEOUT_SECONDS = 3.0
USER_AGENT = "ASCAPRegistrationTriage/0.1 (local metadata triage tool)"
NAME_MATCH_THRESHOLD = 0.88


@dataclass(frozen=True)
class WriterReference:
    writers: list[str]
    sources: list[str]
    status: str
    note: str | None = None


def maybe_lookup_external_writer_reference(
    ascap_work: AscapWork,
    candidates: list[CandidateWork],
) -> WriterReference | None:
    if not _should_lookup(ascap_work, candidates):
        return None

    reference = lookup_external_writer_reference(ascap_work)
    if not reference.writers:
        return reference
    return reference


def lookup_external_writer_reference(ascap_work: AscapWork) -> WriterReference:
    writers: list[str] = []
    sources: list[str] = []

    for lookup in (_lookup_wikidata_writers, _lookup_musicbrainz_writers):
        try:
            result_writers, result_source = lookup(ascap_work)
        except httpx.HTTPError:
            continue
        except (KeyError, TypeError, ValueError):
            continue
        for writer in result_writers:
            if writer and not _contains_name(writers, writer):
                writers.append(writer)
        if result_writers and result_source not in sources:
            sources.append(result_source)

    if writers:
        return WriterReference(
            writers=writers,
            sources=sources,
            status="found",
            note="Public writer reference evidence found from documented public data sources.",
        )

    return WriterReference(
        writers=[],
        sources=[],
        status="not_found",
        note="No public writer reference was found; analysis used captured ASCAP metadata only.",
    )


def reference_to_schema(reference: WriterReference | None) -> ExternalWriterReference | None:
    if reference is None:
        return None
    return ExternalWriterReference(
        writers=reference.writers,
        sources=reference.sources,
        lookup_status=reference.status,
        note=reference.note,
    )


def candidate_reference_matches(
    candidate: CandidateWork,
    reference: WriterReference | None,
) -> tuple[list[str], list[str], list[str]]:
    if not reference or not reference.writers:
        return [], [], []

    candidate_writers = normalized_party_names(candidate.writers)
    matched: list[str] = []
    missing: list[str] = []
    used_candidate_indexes: set[int] = set()

    for reference_writer in reference.writers:
        best_index = -1
        best_score = 0.0
        for index, candidate_writer in enumerate(candidate_writers):
            if index in used_candidate_indexes:
                continue
            score = _name_similarity(reference_writer, candidate_writer)
            if score > best_score:
                best_score = score
                best_index = index
        if best_score >= NAME_MATCH_THRESHOLD and best_index >= 0:
            used_candidate_indexes.add(best_index)
            matched.append(reference_writer)
        else:
            missing.append(reference_writer)

    extra: list[str] = []
    for index, candidate_writer in enumerate(candidate_writers):
        if index in used_candidate_indexes:
            continue
        if _best_name_similarity(candidate_writer, reference.writers) < NAME_MATCH_THRESHOLD:
            extra.append(candidate.writers[index].name)

    return matched, missing, extra


def _should_lookup(ascap_work: AscapWork, candidates: list[CandidateWork]) -> bool:
    if len(candidates) < 2:
        return False
    title = normalize_title(ascap_work.title)
    if not title:
        return False
    same_title_count = sum(1 for candidate in candidates if normalize_title(candidate.title) == title)
    if same_title_count < 2:
        return False
    entered_writer_names = normalized_party_names(ascap_work.writers)
    return len(entered_writer_names) <= 1


def _lookup_wikidata_writers(ascap_work: AscapWork) -> tuple[list[str], str]:
    title = ascap_work.title.strip()
    if not title:
        return [], "Wikidata"

    performer_filter = ""
    performer = (ascap_work.notes or "").strip()
    if performer:
        performer_filter = f"""
          ?work wdt:P175 ?performer .
          ?performer rdfs:label ?performerLabel .
          FILTER(CONTAINS(LCASE(?performerLabel), "{_sparql_string(performer.lower())}"))
        """

    query = f"""
      SELECT DISTINCT ?writerLabel WHERE {{
        ?work rdfs:label ?title .
        FILTER(LANG(?title) = "en")
        FILTER(LCASE(?title) = "{_sparql_string(title.lower())}")
        VALUES ?writerProp {{ wdt:P86 wdt:P676 wdt:P50 }}
        ?work ?writerProp ?writer .
        {performer_filter}
        SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
      }}
      LIMIT 12
    """
    response = httpx.get(
        "https://query.wikidata.org/sparql",
        params={"query": query, "format": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    writers = [
        binding["writerLabel"]["value"]
        for binding in data.get("results", {}).get("bindings", [])
        if binding.get("writerLabel", {}).get("value")
    ]
    return writers, "Wikidata"


def _lookup_musicbrainz_writers(ascap_work: AscapWork) -> tuple[list[str], str]:
    title = ascap_work.title.strip()
    if not title:
        return [], "MusicBrainz"
    query = f'work:"{title}"'
    response = httpx.get(
        "https://musicbrainz.org/ws/2/work",
        params={"query": query, "fmt": "json", "limit": "5"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    writers: list[str] = []
    for work in data.get("works", [])[:5]:
        work_id = work.get("id")
        if not work_id:
            continue
        writers.extend(_musicbrainz_work_writers(work_id))
        if writers:
            break
    return writers, "MusicBrainz"


def _musicbrainz_work_writers(work_id: str) -> list[str]:
    response = httpx.get(
        f"https://musicbrainz.org/ws/2/work/{quote(work_id)}",
        params={"inc": "artist-rels", "fmt": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    writers = []
    for relation in data.get("relations", []):
        relation_type = str(relation.get("type", "")).lower()
        if relation_type not in {"writer", "composer", "lyricist"}:
            continue
        artist = relation.get("artist") or {}
        name = artist.get("name") or artist.get("sort-name")
        if name:
            writers.append(name)
    return writers


def _contains_name(names: list[str], candidate: str) -> bool:
    return any(_name_similarity(candidate, name) >= NAME_MATCH_THRESHOLD for name in names)


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
    return {token for token in value.lower().split() if len(token) > 1}


def _sparql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
