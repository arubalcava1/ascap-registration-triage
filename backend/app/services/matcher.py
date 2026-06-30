from app.schemas import (
    AnalyzeResponse,
    AscapWork,
    CandidateAnalysisResult,
    CandidateWork,
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
    summary = _summary(top_result, len(ranked_results))
    report_text = generate_report_text(ascap_work, ranked_results, DISCLAIMER)

    return AnalyzeResponse(
        results=ranked_results,
        top_result=top_result,
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
