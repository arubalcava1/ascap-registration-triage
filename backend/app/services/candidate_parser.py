import re

from app.schemas import CandidateParseResponse, CandidateWork, Party


FIELD_PATTERNS = {
    "title": re.compile(r"^(?:work\s*)?title\s*(?:[:\-]\s*|\s+)(.+)$", re.IGNORECASE),
    "public_work_id": re.compile(
        r"^(?:public\s*)?(?:bmi\s*)?(?:work\s*)?(?:id|code|number)\s*[:\-]?\s*(.+)$",
        re.IGNORECASE,
    ),
    "iswc": re.compile(r"\b(T[-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[-\s]?\d)\b", re.IGNORECASE),
    "status": re.compile(r"^(?:status|sv\s*status|reconciliation)\s*[:\-]?\s*(.+)$", re.IGNORECASE),
}

SECTION_HEADERS = {
    "writer": re.compile(r"^(writers?|songwriters?|composers?|authors?|writers?\s*/\s*composers?)\s*:?\s*$", re.IGNORECASE),
    "publisher": re.compile(r"^(publishers?)\s*:?\s*$", re.IGNORECASE),
    "performer": re.compile(r"^(performers?)\s*:?\s*$", re.IGNORECASE),
    "alternate_title": re.compile(r"^(alternate\s*titles?)\s*:?\s*$", re.IGNORECASE),
}


def parse_candidate_text(source: str, raw_text: str) -> CandidateParseResponse:
    lines = [_clean_line(line) for line in raw_text.splitlines()]
    lines = [line for line in lines if line]

    title = ""
    public_work_id = None
    iswc = None
    status = None
    writers: list[Party] = []
    publishers: list[Party] = []
    parsed_fields: set[str] = set()
    current_section: str | None = None
    pending_field: str | None = None

    for line in lines:
        if _is_artifact_line(line):
            continue

        if pending_field:
            if pending_field == "title":
                if not _looks_like_party_row(line) and not _looks_like_share_line(line) and not _is_artifact_line(line):
                    title = line
                    parsed_fields.add("title")
            elif pending_field == "public_work_id":
                public_work_id = line
                parsed_fields.add("public_work_id")
            elif pending_field == "iswc":
                if match := FIELD_PATTERNS["iswc"].search(line):
                    iswc = match.group(1).strip()
                    parsed_fields.add("iswc")
            elif pending_field == "status":
                status = line
                parsed_fields.add("status")
            pending_field = None
            continue

        if re.match(r"^(?:work\s*)?title\s*:?\s*$", line, re.IGNORECASE):
            pending_field = "title"
            current_section = None
            continue
        if re.match(r"^(?:public\s*)?(?:bmi\s*)?(?:work\s*)?(?:id|code|number)\s*:?\s*$", line, re.IGNORECASE):
            pending_field = "public_work_id"
            current_section = None
            continue
        if re.match(r"^iswc\s*:?\s*$", line, re.IGNORECASE):
            pending_field = "iswc"
            current_section = None
            continue
        if re.match(r"^(?:status|sv\s*status|reconciliation|songview)\s*:?\s*$", line, re.IGNORECASE):
            pending_field = "status"
            current_section = None
            continue

        if SECTION_HEADERS["writer"].match(line):
            current_section = "writer"
            continue
        if SECTION_HEADERS["publisher"].match(line):
            current_section = "publisher"
            continue
        if SECTION_HEADERS["performer"].match(line) or SECTION_HEADERS["alternate_title"].match(line):
            current_section = None
            continue

        if match := FIELD_PATTERNS["title"].match(line):
            title = match.group(1).strip()
            parsed_fields.add("title")
            current_section = None
            continue

        if match := FIELD_PATTERNS["public_work_id"].match(line):
            public_work_id = match.group(1).strip()
            parsed_fields.add("public_work_id")
            current_section = None
            continue

        if match := FIELD_PATTERNS["status"].match(line):
            status = match.group(1).strip()
            parsed_fields.add("status")
            current_section = None
            continue

        if match := FIELD_PATTERNS["iswc"].search(line):
            iswc = match.group(1).strip()
            parsed_fields.add("iswc")
            if line.lower().startswith("iswc"):
                current_section = None
                continue

        if current_section is None and (not title or not public_work_id):
            if compact := _compact_title_work_id(line):
                title = title or compact[0]
                public_work_id = public_work_id or compact[1]
                parsed_fields.update({"title", "public_work_id"})
                current_section = None
                continue

        inline_writer = _inline_party_line(line, "writer")
        inline_publisher = _inline_party_line(line, "publisher")
        if inline_writer:
            writers.extend(inline_writer)
            parsed_fields.add("writers")
            current_section = None
            continue
        if inline_publisher:
            publishers.extend(inline_publisher)
            parsed_fields.add("publishers")
            current_section = None
            continue

        if current_section in {"writer", "publisher"} and (bmi_party := _bmi_table_party(line, current_section)):
            party_type, party = bmi_party
            if party_type == "writer":
                writers.append(party)
                parsed_fields.add("writers")
            else:
                publishers.append(party)
                parsed_fields.add("publishers")
            continue

        party = _party_from_line(line)
        if current_section == "writer" and party:
            writers.append(party)
            parsed_fields.add("writers")
            continue
        if current_section == "publisher" and party:
            publishers.append(party)
            parsed_fields.add("publishers")
            continue

    if not title:
        title = _infer_title(lines, source)
        if title:
            parsed_fields.add("title")

    warnings = []
    if not title:
        title = "Untitled candidate"
        warnings.append("Could not confidently parse a title.")
    if not writers:
        warnings.append("No writers were parsed from the pasted text.")
    if not publishers:
        warnings.append("No publishers were parsed from the pasted text.")
    if not iswc:
        warnings.append("No ISWC was parsed from the pasted text.")

    candidate = CandidateWork(
        source=source,
        title=title,
        public_work_id=public_work_id,
        iswc=iswc,
        alternate_titles=[],
        writers=writers,
        publishers=publishers,
        status=status,
        source_url=None,
        raw_notes=raw_text,
    )

    return CandidateParseResponse(
        candidate=candidate,
        parsed_fields=sorted(parsed_fields),
        warnings=warnings,
    )


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def _infer_title(lines: list[str], source: str = "") -> str:
    source_lower = source.lower()
    if "ascap" in source_lower:
        ascap_title = _ascap_title_from_context(lines)
        if ascap_title:
            return ascap_title

    current_section: str | None = None
    for line in lines:
        if _is_artifact_line(line):
            continue
        if compact := _compact_title_work_id(line):
            return compact[0]
        lowered = line.lower()
        if SECTION_HEADERS["writer"].match(line):
            current_section = "writer"
            continue
        if SECTION_HEADERS["publisher"].match(line):
            current_section = "publisher"
            continue
        if SECTION_HEADERS["performer"].match(line) or SECTION_HEADERS["alternate_title"].match(line):
            current_section = "performer"
            continue
        if current_section is not None:
            continue
        if lowered.startswith(("writer", "publisher", "iswc", "work id", "bmi work id", "status", "sv status")):
            continue
        if FIELD_PATTERNS["iswc"].search(line):
            continue
        if len(line) >= 2:
            return line
    return ""


def _ascap_title_from_context(lines: list[str]) -> str:
    for index, line in enumerate(lines):
        if FIELD_PATTERNS["iswc"].search(line):
            for previous in reversed(lines[:index]):
                if _is_artifact_line(previous):
                    continue
                if _looks_like_party_row(previous):
                    continue
                if _looks_like_share_line(previous):
                    continue
                if re.match(r"^(?:work\s*)?title\s*:?\s*$", previous, re.IGNORECASE):
                    continue
                return previous
    return ""


def _inline_party_line(line: str, party_type: str) -> list[Party]:
    pattern = re.compile(rf"^{party_type}s?\s*[:\-]\s*(.+)$", re.IGNORECASE)
    match = pattern.match(line)
    if not match:
        return []
    return [_party_from_line(part) for part in _split_parties(match.group(1)) if _party_from_line(part)]


def _split_parties(value: str) -> list[str]:
    return [part.strip() for part in re.split(r";|,", value) if part.strip()]


def _party_from_line(line: str) -> Party | None:
    if _is_artifact_line(line):
        return None
    line = re.sub(r"^(?:writer|publisher|composer|author)\s*[:\-]\s*", "", line, flags=re.IGNORECASE)
    ipi = _extract_ipi(line)
    name = re.sub(r"\s+\|\s*\d+(?:\.\d+)?\s*%?\s*$", "", line)
    name = re.sub(r"\(?\b\d+(?:\.\d+)?\s*%\)?", "", name)
    if ipi:
        name = name.replace(ipi, "")
    name = re.sub(r"\b(?:BMI|ASCAP|SESAC|GMR)\b", "", name)
    name = re.sub(r"\bshare\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+[-|]\s*$", "", name).strip(" -|")
    name = re.sub(r"\s+", " ", name).strip()

    if re.fullmatch(r"[:|.\-\s\d%]+", name):
        return None
    if not name or _is_artifact_line(name) or name.lower() in {"writers", "publishers"}:
        return None

    return Party(name=name, ipi_cae=ipi, share=None)


def _extract_ipi(line: str) -> str | None:
    match = re.search(r"\b0\d{7,10}\b", line)
    return match.group(0) if match else None


def _bmi_table_party(line: str, current_section: str) -> tuple[str, Party] | None:
    match = re.match(
        r"^(.+?)\s+(BMI|ASCAP|SESAC|GMR)\s+(\d{7,10})$",
        line,
        re.IGNORECASE,
    )
    if not match:
        return None

    name = match.group(1).strip()
    affiliation = match.group(2).upper()
    ipi = match.group(3)
    party = Party(name=name, ipi_cae=ipi, share=None)
    return current_section, party


def _looks_like_party_row(line: str) -> bool:
    return bool(re.match(r"^.+?\s+(BMI|ASCAP|SESAC|GMR)\s+\d{7,10}$", line, re.IGNORECASE))


def _looks_like_share_line(line: str) -> bool:
    normalized = line.lower()
    return "share" in normalized or "controls:" in normalized or "% controlled" in normalized


def _compact_title_work_id(line: str) -> tuple[str, str] | None:
    match = re.match(r"^(.+?)\s+(\d{5,9})$", line)
    if not match:
        return None
    title = match.group(1).strip()
    work_id = match.group(2).strip()
    if _is_artifact_line(title) or _looks_like_party_row(line) or FIELD_PATTERNS["iswc"].search(line):
        return None
    return title, work_id


def _is_artifact_line(line: str) -> bool:
    normalized = re.sub(r"\s+", " ", line).strip().lower()
    if not normalized:
        return True
    exact_artifacts = {
        "% controlled",
        "additional non-bmi publishers",
        "additional info",
        "affiliation",
        "bmi award winning song",
        "collapse all",
        "collapse",
        "contact info",
        "controlled",
        "expand",
        "help",
        "include alternate titles",
        "logo",
        "name affiliation ipi #",
        "performer",
        "print",
        "print all",
        "pro ipi",
        "no data available",
        "no information found",
        "total %",
        "title",
        "writer / composer",
    }
    if normalized in exact_artifacts:
        return True
    if normalized.startswith("title bmi work id"):
        return True
    if normalized.startswith("iswc work id"):
        return True
    if normalized.startswith("logo"):
        return True
    if normalized.startswith("songview"):
        return True
    if normalized.startswith("total current ascap share"):
        return True
    if normalized.startswith("total current bmi share"):
        return True
    if "controls:" in normalized and ("ascap" in normalized or "bmi" in normalized):
        return True
    if normalized.startswith("% controlled"):
        return True
    if normalized.startswith("bmi ") and re.search(r"\d+(?:\.\d+)?%", normalized):
        return True
    if normalized.startswith("ascap ") and re.search(r"\d+(?:\.\d+)?%", normalized):
        return True
    if normalized.startswith("work id "):
        return False
    return False
