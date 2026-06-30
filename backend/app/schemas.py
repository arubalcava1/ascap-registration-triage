from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class Party(BaseModel):
    name: str = Field(..., min_length=1)
    ipi_cae: str | None = None
    share: float | None = Field(default=None, ge=0, le=100)


class AscapWork(BaseModel):
    title: str = Field(..., min_length=1)
    song_code: str | None = None
    iswc: str | None = None
    alternate_titles: list[str] = Field(default_factory=list)
    writers: list[Party] = Field(default_factory=list)
    publishers: list[Party] = Field(default_factory=list)
    source_url: HttpUrl | None = None
    notes: str | None = None


class CandidateWork(BaseModel):
    source: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    public_work_id: str | None = None
    iswc: str | None = None
    alternate_titles: list[str] = Field(default_factory=list)
    writers: list[Party] = Field(default_factory=list)
    publishers: list[Party] = Field(default_factory=list)
    status: str | None = None
    source_url: HttpUrl | None = None
    raw_notes: str | None = None


class AnalyzeRequest(BaseModel):
    ascap_work: AscapWork
    candidates: list[CandidateWork] = Field(..., min_length=1)


class CandidateDiscoveryRequest(BaseModel):
    ascap_work: AscapWork
    performer: str | None = None


class CandidateDiscoveryAction(BaseModel):
    source: str
    description: str
    url: str
    search_term: str
    search_type: str
    search_fields: dict[str, str] = Field(default_factory=dict)


class CandidateDiscoveryResponse(BaseModel):
    actions: list[CandidateDiscoveryAction] = Field(default_factory=list)
    summary: str
    disclaimer: str


class CandidateParseRequest(BaseModel):
    source: str = Field(..., min_length=1)
    raw_text: str = Field(..., min_length=1)


class CandidateParseResponse(BaseModel):
    candidate: CandidateWork
    parsed_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


Severity = Literal["low", "medium", "high"]


class Discrepancy(BaseModel):
    type: str
    severity: Severity
    field: str
    description: str
    suggested_review_note: str


class MatchingEvidence(BaseModel):
    field: str
    description: str
    score_impact: float


class NormalizedComparison(BaseModel):
    ascap_title: str
    candidate_title: str
    ascap_iswc: str | None
    candidate_iswc: str | None
    ascap_writers: list[str] = Field(default_factory=list)
    candidate_writers: list[str] = Field(default_factory=list)
    ascap_publishers: list[str] = Field(default_factory=list)
    candidate_publishers: list[str] = Field(default_factory=list)


class CandidateAnalysisResult(BaseModel):
    candidate: CandidateWork
    rank: int
    confidence_score: float
    confidence_label: str
    comparison_details: NormalizedComparison
    matching_evidence: list[MatchingEvidence] = Field(default_factory=list)
    discrepancies: list[Discrepancy] = Field(default_factory=list)


ReviewDecisionLabel = Literal["Likely Same Work", "Needs Manual Review", "Likely Different Work"]
ReviewDecisionSeverity = Literal["success", "warning", "danger"]


class ReviewDecision(BaseModel):
    label: ReviewDecisionLabel
    severity: ReviewDecisionSeverity
    confidence_score: float
    rationale: list[str] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    results: list[CandidateAnalysisResult]
    top_result: CandidateAnalysisResult | None
    review_decision: ReviewDecision
    summary: str
    report_text: str
    disclaimer: str
