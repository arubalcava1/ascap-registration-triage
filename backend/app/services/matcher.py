from app.schemas import (
    AnalyzeResponse,
    AscapWork,
    CandidateAnalysisResult,
    CandidateWork,
    ReviewDecision,
)
from app.services.comparison import build_comparison_details
from app.services.discrepancy_checker import detect_discrepancies
from app.services.report_generator import generate_report_text
from app.services.scoring import confidence_label, score_candidate


DISCLAIMER = (
    "This analysis is a metadata triage signal only. It is not an official ASCAP determination, "
    "legal ownership conclusion, royalty calculation, or automatic registration fix."
)


def analyze_candidates(ascap_work: AscapWork, candidates: list[CandidateWork]) -> AnalyzeResponse:
    unranked_results: list[CandidateAnalysisResult] = []

    for candidate in candidates:
        score, evidence = score_candidate(ascap_work, candidate)
        discrepancies = detect_discrepancies(ascap_work, candidate)
        comparison_details = build_comparison_details(ascap_work, candidate)
        unranked_results.append(
            CandidateAnalysisResult(
                candidate=candidate,
                rank=0,
                confidence_score=score,
                confidence_label=confidence_label(score),
                comparison_details=comparison_details,
                matching_evidence=evidence,
                discrepancies=discrepancies,
            )
        )

    sorted_results = sorted(unranked_results, key=lambda result: result.confidence_score, reverse=True)
    ranked_results = [
        result.model_copy(update={"rank": index})
        for index, result in enumerate(sorted_results, start=1)
    ]

    top_result = ranked_results[0] if ranked_results else None
    review_decision = _review_decision(top_result)
    summary = _summary(top_result, len(ranked_results))
    report_text = generate_report_text(ascap_work, ranked_results, review_decision, DISCLAIMER)

    return AnalyzeResponse(
        results=ranked_results,
        top_result=top_result,
        review_decision=review_decision,
        summary=summary,
        report_text=report_text,
        disclaimer=DISCLAIMER,
    )


def _summary(top_result: CandidateAnalysisResult | None, candidate_count: int) -> str:
    if not top_result:
        return "No candidate records were analyzed."
    return (
        f"Analyzed {candidate_count} candidate record(s). "
        f"Top candidate is ranked as {top_result.confidence_label} with a "
        f"{top_result.confidence_score}% confidence score."
    )


def _review_decision(top_result: CandidateAnalysisResult | None) -> ReviewDecision:
    if not top_result:
        return ReviewDecision(
            label="Needs Manual Review",
            severity="warning",
            confidence_score=0,
            rationale=["No candidate records were available for analysis."],
        )

    high_severity_count = sum(1 for item in top_result.discrepancies if item.severity == "high")
    medium_severity_count = sum(1 for item in top_result.discrepancies if item.severity == "medium")
    title_match = top_result.comparison_details.ascap_title == top_result.comparison_details.candidate_title
    has_iswc_conflict = any(item.type == "iswc_mismatch" for item in top_result.discrepancies)

    rationale = _decision_rationale(top_result, title_match, high_severity_count, medium_severity_count)

    if top_result.confidence_score >= 85 and high_severity_count == 0 and not has_iswc_conflict:
        return ReviewDecision(
            label="Likely Same Work",
            severity="success",
            confidence_score=top_result.confidence_score,
            rationale=rationale,
        )

    if top_result.confidence_score < 50 or has_iswc_conflict or high_severity_count >= 2:
        return ReviewDecision(
            label="Likely Different Work",
            severity="danger",
            confidence_score=top_result.confidence_score,
            rationale=rationale,
        )

    return ReviewDecision(
        label="Needs Manual Review",
        severity="warning",
        confidence_score=top_result.confidence_score,
        rationale=rationale,
    )


def _decision_rationale(
    top_result: CandidateAnalysisResult,
    title_match: bool,
    high_severity_count: int,
    medium_severity_count: int,
) -> list[str]:
    rationale = []

    if title_match:
        rationale.append("Title normalizes to the same work title.")
    elif top_result.confidence_score >= 50:
        rationale.append("Title is similar, but not an exact normalized match.")
    else:
        rationale.append("Title similarity is weak.")

    if top_result.matching_evidence:
        evidence_fields = ", ".join(item.field for item in top_result.matching_evidence[:4])
        rationale.append(f"Positive evidence was found for: {evidence_fields}.")

    if high_severity_count:
        rationale.append(f"{high_severity_count} high-severity discrepancy item(s) require review.")
    if medium_severity_count:
        rationale.append(f"{medium_severity_count} medium-severity discrepancy item(s) require review.")

    return rationale[:5] or ["Review the candidate metadata before follow-up."]
