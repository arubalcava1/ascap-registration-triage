from app.schemas import AscapWork, CandidateAnalysisResult, ExternalWriterReference, ReviewDecision
from app.services.scoring import best_name_similarity


def generate_report_text(
    ascap_work: AscapWork,
    results: list[CandidateAnalysisResult],
    review_decision: ReviewDecision,
    disclaimer: str,
    external_writer_reference: ExternalWriterReference | None = None,
) -> str:
    lines = [
        "ASCAP Possible Match Review",
        "===========================",
        "",
        "ASCAP Work Searched",
        "-------------------",
        f"Title: {ascap_work.title}",
        f"ASCAP Song Code: {ascap_work.song_code or 'Not provided'}",
        f"ISWC: {ascap_work.iswc or 'Not shown'}",
        f"Writers: {_party_names(ascap_work.writers)}",
        f"Publishers: {_party_names(ascap_work.publishers)}",
        "",
        "Review Decision",
        "---------------",
        f"Decision: {review_decision.label}",
        f"Decision Score: {review_decision.confidence_score}%",
        "Why:",
    ]
    lines.extend(_prefixed_lines(review_decision.rationale))
    lines.append("")

    if external_writer_reference:
        lines.extend(
            [
                "External Writer Reference",
                "-------------------------",
                f"Status: {external_writer_reference.lookup_status}",
                f"Sources: {_source_names(external_writer_reference.sources)}",
                f"Writers: {_reference_writer_names(external_writer_reference.writers)}",
                "Note: Public reference evidence is advisory and should be reviewed against ASCAP.",
                "",
            ]
        )

    if results:
        top_result = results[0]
        lines.extend(
            [
                "Top Candidate",
                "-------------",
                f"Rank: {top_result.rank}",
                f"Title: {top_result.candidate.title}",
                f"ASCAP Work ID: {top_result.candidate.public_work_id or 'Not provided'}",
                f"Match Score: {top_result.confidence_score}%",
                f"Confidence Label: {top_result.confidence_label}",
                "",
                "Why This Candidate Ranked First",
                "-------------------------------",
            ]
        )
        lines.extend(_prefixed_lines(_winner_summary(ascap_work, top_result)))
        lines.extend(
            [
                "",
                "Writer Review",
                "-------------",
            ]
        )
        lines.extend(_prefixed_lines(_writer_review_lines(top_result)))
        if ascap_work.song_code or ascap_work.iswc:
            lines.extend(
                [
                    "",
                    "Identifier Review",
                    "-----------------",
                ]
            )
            lines.extend(_prefixed_lines(_identifier_review_lines(top_result)))
        lines.extend(
            [
                "",
                "Matching Evidence",
                "-----------------",
            ]
        )
        lines.extend(_prefixed_lines([item.description for item in top_result.matching_evidence]))
        lines.extend(["", "Discrepancies", "-------------"])
        lines.extend(_prefixed_lines([item.description for item in top_result.discrepancies]))
        lines.extend(["", "Suggested Follow-Up", "-------------------"])
        lines.extend(_prefixed_lines(_suggested_notes(top_result)))
    else:
        lines.extend(["No candidate records were analyzed.", ""])

    lines.extend(["", "Disclaimer", "----------", disclaimer])
    return "\n".join(lines).strip()


def _party_names(parties) -> str:
    if not parties:
        return "Not provided"
    return ", ".join(party.name for party in parties)


def _prefixed_lines(items: list[str]) -> list[str]:
    if not items:
        return ["- None returned"]
    return [f"- {item}" for item in items]


def _suggested_notes(result: CandidateAnalysisResult) -> list[str]:
    notes = []
    for discrepancy in result.discrepancies[:5]:
        if discrepancy.suggested_review_note not in notes:
            notes.append(discrepancy.suggested_review_note)
    return notes or ["Review the top candidate metadata before follow-up."]


def _winner_summary(ascap_work: AscapWork, result: CandidateAnalysisResult) -> list[str]:
    lines = []
    title_matches = result.comparison_details.ascap_title == result.comparison_details.candidate_title
    if title_matches:
        lines.append("The title normalizes to the same ASCAP work title.")
    matched_writers = _matched_writer_lines(result)
    if matched_writers:
        lines.append(f"{len(matched_writers)} writer name(s) matched the candidate record.")
    extra_writers = _discrepancy_names(result, "extra_writer")
    missing_writers = _discrepancy_names(result, "missing_writer")
    extra_reference_writers = _discrepancy_names(result, "extra_reference_writer")
    missing_reference_writers = _discrepancy_names(result, "missing_reference_writer")
    if extra_writers:
        lines.append(f"Candidate has extra writer(s): {', '.join(extra_writers)}.")
    if missing_writers:
        lines.append(f"Candidate is missing searched writer(s): {', '.join(missing_writers)}.")
    if extra_reference_writers:
        lines.append(f"Candidate has writer(s) not found in the public reference: {', '.join(extra_reference_writers)}.")
    if missing_reference_writers:
        lines.append(f"Candidate is missing public reference writer(s): {', '.join(missing_reference_writers)}.")
    if ascap_work.song_code and result.candidate.public_work_id:
        lines.append("ASCAP song code was compared with the candidate ASCAP Work ID.")
    if ascap_work.iswc and result.candidate.iswc:
        lines.append("ISWC was compared because it was provided for the work under review.")
    return lines


def _writer_review_lines(result: CandidateAnalysisResult) -> list[str]:
    lines = _matched_writer_lines(result)
    for name in _discrepancy_names(result, "missing_writer"):
        lines.append(f"Missing from candidate: {name}")
    for name in _discrepancy_names(result, "extra_writer"):
        lines.append(f"Extra in candidate: {name}")
    for name in _discrepancy_names(result, "missing_reference_writer"):
        lines.append(f"Missing public reference writer: {name}")
    for name in _discrepancy_names(result, "extra_reference_writer"):
        lines.append(f"Not in public writer reference: {name}")
    return lines


def _matched_writer_lines(result: CandidateAnalysisResult) -> list[str]:
    candidate_writers = result.comparison_details.candidate_writers
    used_indexes: set[int] = set()
    lines = []
    for ascap_writer in result.comparison_details.ascap_writers:
        best_index = -1
        best_score = 0.0
        best_name = ""
        for index, candidate_writer in enumerate(candidate_writers):
            if index in used_indexes:
                continue
            score = best_name_similarity(ascap_writer, candidate_writer)
            if score > best_score:
                best_score = score
                best_index = index
                best_name = candidate_writer
        if best_score >= 0.88:
            used_indexes.add(best_index)
            lines.append(f"Matched: {ascap_writer} -> {best_name}")
    return lines


def _identifier_review_lines(result: CandidateAnalysisResult) -> list[str]:
    lines = []
    for item in result.matching_evidence:
        if item.field in {"song_code", "iswc"}:
            lines.append(item.description)
    for item in result.discrepancies:
        if item.field in {"song_code", "iswc"}:
            lines.append(item.description)
    return lines


def _discrepancy_names(result: CandidateAnalysisResult, discrepancy_type: str) -> list[str]:
    names = []
    for item in result.discrepancies:
        if item.type != discrepancy_type:
            continue
        if "'" in item.description:
            names.append(item.description.split("'")[1])
        else:
            names.append(item.description)
    return names


def _source_names(sources: list[str]) -> str:
    return ", ".join(sources) if sources else "None found"


def _reference_writer_names(writers: list[str]) -> str:
    return ", ".join(writers) if writers else "None found"
