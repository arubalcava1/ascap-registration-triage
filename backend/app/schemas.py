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


class CandidateAnalysisResult(BaseModel):
    candidate: CandidateWork
    rank: int
    confidence_score: float
    confidence_label: str
    matching_evidence: list[MatchingEvidence] = Field(default_factory=list)
    discrepancies: list[Discrepancy] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    results: list[CandidateAnalysisResult]
    top_result: CandidateAnalysisResult | None
    summary: str
    disclaimer: str
