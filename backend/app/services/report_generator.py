from app.schemas import AscapWork, CandidateAnalysisResult, ReviewDecision


def generate_report_text(
    ascap_work: AscapWork,
    results: list[CandidateAnalysisResult],
    review_decision: ReviewDecision,
    disclaimer: str,
) -> str:
    lines = [
        "ASCAP Registration Triage Report",
        "================================",
        "",
        "Work Under Review",
        "-----------------",
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

    if results:
        top_result = results[0]
        lines.extend(
            [
                "Top Candidate",
                "-------------",
                f"Rank: {top_result.rank}",
                f"Title: {top_result.candidate.title}",
                f"Source: {top_result.candidate.source}",
                f"Public Work ID: {top_result.candidate.public_work_id or 'Not provided'}",
                f"Match Score: {top_result.confidence_score}%",
                f"Confidence Label: {top_result.confidence_label}",
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
