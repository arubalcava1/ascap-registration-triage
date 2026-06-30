import re

from app.schemas import CandidateParseResponse, CandidateWork, Party


FIELD_PATTERNS = {
    "title": re.compile(r"^(?:work\s*)?title\s*[:\-]\s*(.+)$", re.IGNORECASE),
    "public_work_id": re.compile(
        r"^(?:public\s*)?(?:work\s*)?(?:id|code|number)\s*[:\-]\s*(.+)$",
        re.IGNORECASE,
    ),
    "iswc": re.compile(r"\b(T[-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[-\s]?\d)\b", re.IGNORECASE),
    "status": re.compile(r"^(?:status|reconciliation|songview)\s*[:\-]\s*(.+)$", re.IGNORECASE),
}

SECTION_HEADERS = {
    "writer": re.compile(r"^(writers?|songwriters?|composers?|authors?)\s*:?\s*$", re.IGNORECASE),
    "publisher": re.compile(r"^(publishers?)\s*:?\s*$", re.IGNORECASE),
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

    for line in lines:
        if SECTION_HEADERS["writer"].match(line):
            current_section = "writer"
            continue
        if SECTION_HEADERS["publisher"].match(line):
            current_section = "publisher"
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

        party = _party_from_line(line)
        if current_section == "writer" and party:
            writers.append(party)
            parsed_fields.add("writers")
            continue
        if current_section == "publisher" and party:
            publishers.append(party)
            parsed_fields.add("publishers")

    if not title:
        title = _infer_title(lines)
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


def _infer_title(lines: list[str]) -> str:
    for line in lines:
        lowered = line.lower()
        if lowered.startswith(("writer", "publisher", "iswc", "work id", "status")):
            continue
        if FIELD_PATTERNS["iswc"].search(line):
            continue
        if len(line) >= 2:
            return line
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
    line = re.sub(r"^(?:writer|publisher|composer|author)\s*[:\-]\s*", "", line, flags=re.IGNORECASE)
    share = _extract_share(line)
    name = re.sub(r"\(?\b\d+(?:\.\d+)?\s*%?\)?", "", line)
    name = re.sub(r"\bshare\b", "", name, flags=re.IGNORECASE)
    name = re.sub(r"\s+[-|]\s*$", "", name).strip(" -|")
    name = re.sub(r"\s+", " ", name).strip()

    if not name or name.lower() in {"writers", "publishers"}:
        return None

    return Party(name=name, ipi_cae=None, share=share)


def _extract_share(line: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", line)
    if not match:
        match = re.search(r"(?:share\s*[:\-]?\s*)(\d+(?:\.\d+)?)", line, re.IGNORECASE)
    if not match:
        parts = [part.strip() for part in line.split("|")]
        if len(parts) > 1:
            try:
                return float(parts[-1].replace("%", ""))
            except ValueError:
                return None
        return None
    return float(match.group(1))
