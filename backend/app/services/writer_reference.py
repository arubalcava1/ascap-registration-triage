from __future__ import annotations

from dataclasses import dataclass
import re
from urllib.parse import quote

import httpx
from rapidfuzz import fuzz

from app.schemas import AscapWork, CandidateWork, ExternalWriterReference
from app.services.normalizer import normalize_compact_text, normalize_name, normalize_title, normalized_party_names


REQUEST_TIMEOUT_SECONDS = 8.0
USER_AGENT = "ASCAPRegistrationTriage/0.1 (local metadata triage tool)"
NAME_MATCH_THRESHOLD = 0.88


@dataclass(frozen=True)
class WriterReference:
    writers: list[str]
    sources: list[str]
    status: str
    note: str | None = None


@dataclass(frozen=True)
class _SourceWriterResult:
    writers: list[str]
    source: str
    confidence: float


def maybe_lookup_external_writer_reference(
    ascap_work: AscapWork,
    candidates: list[CandidateWork],
) -> WriterReference | None:
    if not _should_lookup(ascap_work, candidates):
        return None

    reference = lookup_external_writer_reference(ascap_work, candidates)
    if not reference.writers:
        return reference
    if not _reference_matches_entered_writer_context(ascap_work, reference):
        captured_reference = _captured_candidate_writer_reference(ascap_work, candidates)
        if captured_reference:
            return captured_reference
        return WriterReference(
            writers=[],
            sources=reference.sources,
            status="not_found",
            note=(
                "Public writer reference was ignored because it did not match the writer "
                "context entered for this ASCAP search."
            ),
        )
    return reference


def lookup_external_writer_reference(
    ascap_work: AscapWork,
    candidates: list[CandidateWork] | None = None,
) -> WriterReference:
    entered_writer_names = normalized_party_names(ascap_work.writers)
    candidate_writer_names = _candidate_writer_names(candidates or [])
    source_results: list[_SourceWriterResult] = []

    for title in _title_variants(ascap_work, candidates or []):
        for lookup in (_lookup_wikidata_writers, _lookup_wikipedia_writers, _lookup_musicbrainz_writers):
            try:
                result_writers, result_source = lookup(ascap_work, title)
            except httpx.HTTPError:
                continue
            except (KeyError, TypeError, ValueError):
                continue
            result_writers = _unique_names(result_writers)
            if not result_writers:
                continue
            confidence = _reference_confidence(
                result_writers,
                entered_writer_names,
                candidate_writer_names,
            )
            if confidence <= 0:
                continue
            source_results.append(_SourceWriterResult(result_writers, result_source, confidence))

    accepted_writers, accepted_sources = _select_reference_result(source_results)
    if accepted_writers:
        return WriterReference(
            writers=accepted_writers,
            sources=accepted_sources,
            status="found",
            note=(
                "Public writer reference evidence found from documented public data "
                "sources using title, entered writer context, and captured ASCAP candidates."
            ),
        )

    captured_reference = _captured_candidate_writer_reference(ascap_work, candidates or [])
    if captured_reference:
        return captured_reference

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
    reference_writers = _unique_names(reference.writers)
    matched: list[str] = []
    missing: list[str] = []
    used_candidate_indexes: set[int] = set()

    for reference_writer in reference_writers:
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
        if _best_name_similarity(candidate_writer, reference_writers) < NAME_MATCH_THRESHOLD:
            extra.append(candidate.writers[index].name)

    return matched, missing, extra


def _should_lookup(ascap_work: AscapWork, candidates: list[CandidateWork]) -> bool:
    if not candidates:
        return False
    title = normalize_title(ascap_work.title)
    if not title:
        return False
    entered_writer_names = normalized_party_names(ascap_work.writers)
    if len(entered_writer_names) > 1:
        return False
    same_title_count = sum(1 for candidate in candidates if normalize_title(candidate.title) == title)
    return same_title_count >= 2 or bool(entered_writer_names)


def _reference_matches_entered_writer_context(
    ascap_work: AscapWork,
    reference: WriterReference,
) -> bool:
    entered_writer_names = normalized_party_names(ascap_work.writers)
    if not entered_writer_names:
        return True

    return any(
        _best_name_similarity(entered_writer_name, reference.writers) >= NAME_MATCH_THRESHOLD
        for entered_writer_name in entered_writer_names
    )


def _reference_confidence(
    reference_writers: list[str],
    entered_writer_names: list[str],
    candidate_writer_names: list[str],
) -> float:
    normalized_reference_writers = [name for name in (normalize_name(writer) for writer in reference_writers) if name]
    if not normalized_reference_writers:
        return 0.0

    score = 0.25
    if entered_writer_names:
        entered_overlap = _average_best_name_similarity(entered_writer_names, normalized_reference_writers)
        if entered_overlap < NAME_MATCH_THRESHOLD:
            return 0.0
        score += entered_overlap * 0.45

    if candidate_writer_names:
        candidate_overlap = _average_best_name_similarity(normalized_reference_writers, candidate_writer_names)
        if candidate_overlap < 0.45:
            return 0.0
        score += candidate_overlap * 0.30

    return min(score, 1.0)


def _select_reference_result(source_results: list[_SourceWriterResult]) -> tuple[list[str], list[str]]:
    if not source_results:
        return [], []

    ranked_results = sorted(source_results, key=lambda result: result.confidence, reverse=True)
    best = ranked_results[0]
    writers = list(best.writers)
    sources = [best.source]

    for result in ranked_results[1:]:
        if result.confidence < 0.75:
            continue
        if _writer_set_similarity(writers, result.writers) < 0.60:
            continue
        for writer in result.writers:
            if writer and not _contains_name(writers, writer):
                writers.append(writer)
        if result.source not in sources:
            sources.append(result.source)

    return writers, sources


def _candidate_writer_names(candidates: list[CandidateWork]) -> list[str]:
    writers: list[str] = []
    for candidate in candidates:
        for writer_name in normalized_party_names(candidate.writers):
            if writer_name and not _contains_name(writers, writer_name):
                writers.append(writer_name)
    return writers


def _captured_candidate_writer_reference(
    ascap_work: AscapWork,
    candidates: list[CandidateWork],
) -> WriterReference | None:
    title = normalize_title(ascap_work.title)
    entered_writer_names = normalized_party_names(ascap_work.writers)
    groups: dict[tuple[str, ...], tuple[int, list[str]]] = {}

    for candidate in candidates:
        if title and normalize_title(candidate.title) != title:
            continue
        writers = _display_writer_names(candidate)
        if not writers:
            continue
        normalized_writers = [normalize_name(writer) for writer in writers if normalize_name(writer)]
        if entered_writer_names and _average_best_name_similarity(entered_writer_names, normalized_writers) < NAME_MATCH_THRESHOLD:
            continue
        signature = tuple(sorted(normalize_compact_text(writer) for writer in writers if normalize_compact_text(writer)))
        if not signature:
            continue
        count, existing_writers = groups.get(signature, (0, writers))
        groups[signature] = (count + 1, existing_writers)

    if not groups:
        return None

    _, (count, writers) = max(groups.items(), key=lambda item: (item[1][0], len(item[1][1])))
    if count < 2 and not entered_writer_names:
        return None

    return WriterReference(
        writers=writers,
        sources=["Captured ASCAP public repertoire"],
        status="found",
        note=(
            "No documented external source returned a usable writer set, so the analyzer used "
            "visible writer metadata captured from ASCAP public repertoire results."
        ),
    )


def _display_writer_names(candidate: CandidateWork) -> list[str]:
    writers: list[str] = []
    for party in candidate.writers:
        if party.name and not _contains_name(writers, party.name):
            writers.append(party.name)
    return writers


def _average_best_name_similarity(source_names: list[str], target_names: list[str]) -> float:
    if not source_names or not target_names:
        return 0.0
    return sum(_best_name_similarity(source_name, target_names) for source_name in source_names) / len(source_names)


def _writer_set_similarity(left: list[str], right: list[str]) -> float:
    if not left or not right:
        return 0.0
    left_to_right = _average_best_name_similarity(
        [normalize_name(name) for name in left],
        [normalize_name(name) for name in right],
    )
    right_to_left = _average_best_name_similarity(
        [normalize_name(name) for name in right],
        [normalize_name(name) for name in left],
    )
    return (left_to_right + right_to_left) / 2


def _lookup_wikidata_writers(ascap_work: AscapWork, title: str) -> tuple[list[str], str]:
    title = title.strip()
    if not title:
        return [], "Wikidata"

    performer_filter = ""
    performer = (getattr(ascap_work, "performer", None) or "").strip()
    if performer:
        performer_filter = f"""
          ?work wdt:P175 ?performer .
          ?performer rdfs:label ?performerLabel .
          FILTER(CONTAINS(LCASE(?performerLabel), "{_sparql_string(performer.lower())}"))
        """

    writer_filter = ""
    entered_writer_names = normalized_party_names(ascap_work.writers)
    if entered_writer_names:
        writer_conditions = " || ".join(
            f'CONTAINS(LCASE(?writerLabel), "{_sparql_string(writer_name)}")'
            for writer_name in entered_writer_names
        )
        writer_filter = f"FILTER({writer_conditions})"

    query = f"""
      SELECT DISTINCT ?writerLabel WHERE {{
        ?work rdfs:label ?title .
        FILTER(LANG(?title) = "en")
        FILTER(LCASE(?title) = "{_sparql_string(title.lower())}")
        VALUES ?writerProp {{ wdt:P86 wdt:P676 wdt:P50 }}
        ?work ?writerProp ?writer .
        {performer_filter}
        SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        {writer_filter}
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


def _lookup_wikipedia_writers(ascap_work: AscapWork, title: str) -> tuple[list[str], str]:
    title = title.strip()
    if not title:
        return [], "Wikipedia"

    for search_term in _wikipedia_search_terms(ascap_work, title):
        search_response = httpx.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "list": "search",
                "srsearch": search_term,
                "format": "json",
                "srlimit": "5",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        search_response.raise_for_status()
        search_data = search_response.json()
        for result in search_data.get("query", {}).get("search", []):
            page_title = result.get("title")
            if not page_title or not _looks_like_title_match(title, page_title):
                continue
            writers = _wikipedia_page_writers(page_title)
            if writers:
                return writers, "Wikipedia"
    return [], "Wikipedia"


def _wikipedia_search_terms(ascap_work: AscapWork, title: str) -> list[str]:
    terms: list[str] = []
    entered_writer_names = normalized_party_names(ascap_work.writers)
    performer = (getattr(ascap_work, "performer", None) or "").strip()

    for writer_name in entered_writer_names:
        terms.append(f'"{title}" "{writer_name}" song')
    if performer:
        terms.append(f'"{title}" "{performer}" song')
    terms.append(f'"{title}" song')

    deduped: list[str] = []
    seen: set[str] = set()
    for term in terms:
        key = normalize_compact_text(term)
        if key and key not in seen:
            seen.add(key)
            deduped.append(term)
    return deduped


def _lookup_musicbrainz_writers(ascap_work: AscapWork, title: str) -> tuple[list[str], str]:
    title = title.strip()
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
    if writers:
        return writers, "MusicBrainz"
    return _musicbrainz_recording_writers_for_title(title, getattr(ascap_work, "performer", None)), "MusicBrainz"


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


def _musicbrainz_recording_writers_for_title(title: str, performer: str | None = None) -> list[str]:
    query = f'recording:"{title}"'
    if performer:
        query += f' AND artist:"{performer}"'
    response = httpx.get(
        "https://musicbrainz.org/ws/2/recording",
        params={"query": query, "fmt": "json", "limit": "10"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()

    writers: list[str] = []
    for recording in data.get("recordings", []):
        if not _looks_like_title_match(title, recording.get("title", "")):
            continue
        if performer and not _recording_artist_matches(recording, performer):
            continue
        recording_id = recording.get("id")
        if not recording_id:
            continue
        for writer in _musicbrainz_recording_writers(recording_id):
            if writer and not _contains_name(writers, writer):
                writers.append(writer)
        if writers:
            return writers
    return writers


def _musicbrainz_recording_writers(recording_id: str) -> list[str]:
    response = httpx.get(
        f"https://musicbrainz.org/ws/2/recording/{quote(recording_id)}",
        params={"inc": "artist-rels+work-rels", "fmt": "json"},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()

    writers: list[str] = []
    for relation in data.get("relations", []):
        relation_type = str(relation.get("type", "")).lower()
        artist = relation.get("artist") or {}
        if relation_type in {"writer", "composer", "lyricist"}:
            name = artist.get("name") or artist.get("sort-name")
            if name and not _contains_name(writers, name):
                writers.append(name)
        work = relation.get("work") or {}
        work_id = work.get("id")
        if work_id:
            for writer in _musicbrainz_work_writers(work_id):
                if writer and not _contains_name(writers, writer):
                    writers.append(writer)
    return writers


def _recording_artist_matches(recording: dict, performer: str) -> bool:
    performer_normalized = normalize_title(performer)
    if not performer_normalized:
        return True
    artist_credit = " ".join(
        str(credit.get("name") or (credit.get("artist") or {}).get("name") or "")
        for credit in recording.get("artist-credit", [])
    )
    return _name_similarity(performer_normalized, normalize_title(artist_credit)) >= 0.88


def _wikipedia_page_writers(page_title: str) -> list[str]:
    response = httpx.get(
        "https://en.wikipedia.org/w/api.php",
        params={
            "action": "parse",
            "page": page_title,
            "prop": "wikitext",
            "format": "json",
            "redirects": "1",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    data = response.json()
    wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
    if not wikitext:
        return []

    writers: list[str] = []
    for field in ("writer", "writers", "songwriter", "songwriter(s)", "composer", "composers", "lyricist", "lyricists"):
        field_value = _wikipedia_infobox_field(wikitext, field)
        for writer in _split_wikipedia_names(field_value):
            if writer and not _contains_name(writers, writer):
                writers.append(writer)
    return writers


def _wikipedia_infobox_field(wikitext: str, field: str) -> str:
    pattern = re.compile(
        r"^\s*\|\s*"
        + re.escape(field)
        + r"\s*=\s*(.+?)(?=^\s*\|\s*\w|\n\}\}|\Z)",
        re.IGNORECASE | re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(wikitext)
    return match.group(1).strip() if match else ""


def _split_wikipedia_names(value: str) -> list[str]:
    if not value:
        return []
    cleaned = value
    cleaned = re.sub(r"<!--.*?-->", " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<br\s*/?>", "\n", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\{\{(?:flatlist|plainlist|hlist|ubl|unbulleted list)\s*\|", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\{\{.*?\}\}", " ", cleaned)
    cleaned = re.sub(r"\[\[(?:[^|\]]+\|)?([^\]]+)\]\]", r"\1", cleaned)
    cleaned = cleaned.replace("'''", "").replace("''", "")
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(r"\{\{|\}\}", " ", cleaned)
    parts = re.split(r"\n|\*|;|,|\band\b|/|&", cleaned, flags=re.IGNORECASE)
    names = []
    for part in parts:
        name = re.sub(r"\s+", " ", part).strip(" .:-")
        if not name or len(name) < 3:
            continue
        if name.lower() in {"music", "lyrics", "songwriter", "songwriters", "composer", "lyricist"}:
            continue
        names.append(name)
    return names


def _title_variants(ascap_work: AscapWork, candidates: list[CandidateWork]) -> list[str]:
    titles = [ascap_work.title, *ascap_work.alternate_titles]
    for candidate in candidates:
        titles.append(candidate.title)
        titles.extend(candidate.alternate_titles)

    variants: list[str] = []
    seen: set[str] = set()
    for title in titles:
        cleaned = re.sub(r"\s+", " ", (title or "").strip())
        if not cleaned:
            continue
        for variant in (cleaned, cleaned.replace("'", ""), cleaned.replace("'", " ")):
            key = normalize_title(variant)
            if key and key not in seen:
                seen.add(key)
                variants.append(variant)
    return variants


def _looks_like_title_match(search_title: str, page_title: str) -> bool:
    normalized_search = normalize_title(search_title)
    normalized_page = normalize_title(re.sub(r"\(.+?\)", "", page_title))
    if not normalized_search or not normalized_page:
        return False
    return normalized_search == normalized_page or normalized_search in normalized_page


def _writer_names_overlap(entered_writer_names: list[str], reference_writers: list[str]) -> bool:
    return any(
        _best_name_similarity(entered_writer_name, reference_writers) >= NAME_MATCH_THRESHOLD
        for entered_writer_name in entered_writer_names
    )


def _contains_name(names: list[str], candidate: str) -> bool:
    return any(_name_similarity(candidate, name) >= NAME_MATCH_THRESHOLD for name in names)


def _unique_names(names: list[str]) -> list[str]:
    unique: list[str] = []
    for name in names:
        cleaned = re.sub(r"\s+", " ", (name or "").strip())
        if cleaned and not _contains_name(unique, cleaned):
            unique.append(cleaned)
    return unique


def _best_name_similarity(name: str, candidates: list[str]) -> float:
    if not candidates:
        return 0.0
    return max(_name_similarity(name, candidate) for candidate in candidates)


def _name_similarity(left: str, right: str) -> float:
    compact_score = _compact_name_similarity(left, right)
    if compact_score:
        return compact_score

    left_tokens = _name_tokens(left)
    right_tokens = _name_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    if left_tokens <= right_tokens or right_tokens <= left_tokens:
        return 1.0
    if _shared_distinctive_tokens_match(left_tokens, right_tokens):
        return 1.0
    if _distinctive_last_name_match(left_tokens, right_tokens):
        return 0.95
    return fuzz.token_sort_ratio(left, right) / 100


def _compact_name_similarity(left: str, right: str) -> float:
    left_compact = normalize_compact_text(left)
    right_compact = normalize_compact_text(right)
    if not left_compact or not right_compact:
        return 0.0
    if left_compact == right_compact:
        return 1.0
    if min(len(left_compact), len(right_compact)) >= 4 and (
        left_compact in right_compact or right_compact in left_compact
    ):
        return 1.0
    if min(len(left_compact), len(right_compact)) >= 3 and fuzz.ratio(left_compact, right_compact) >= 85:
        return 1.0
    return 0.0


def _name_tokens(value: str) -> set[str]:
    return {token for token in normalize_name(value).split() if len(token) > 1}


def _distinctive_last_name_match(left_tokens: set[str], right_tokens: set[str]) -> bool:
    shared_tokens = left_tokens & right_tokens
    return any(len(token) >= 4 for token in shared_tokens)


def _shared_distinctive_tokens_match(left_tokens: set[str], right_tokens: set[str]) -> bool:
    shared_tokens = {token for token in left_tokens & right_tokens if len(token) >= 3}
    return len(shared_tokens) >= 2


def _sparql_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
