export type Party = {
  name: string;
  ipi_cae: string | null;
  share: number | null;
};

export type AscapWork = {
  title: string;
  song_code: string | null;
  iswc: string | null;
  alternate_titles: string[];
  writers: Party[];
  publishers: Party[];
  source_url: string | null;
  notes: string | null;
};

export type CandidateWork = {
  source: string;
  title: string;
  public_work_id: string | null;
  iswc: string | null;
  alternate_titles: string[];
  writers: Party[];
  publishers: Party[];
  status: string | null;
  source_url: string | null;
  raw_notes: string | null;
};

export type AnalyzeRequest = {
  ascap_work: AscapWork;
  candidates: CandidateWork[];
};

export type CandidateDiscoveryRequest = {
  ascap_work: AscapWork;
  performer: string | null;
};

export type CandidateDiscoveryAction = {
  source: string;
  description: string;
  url: string;
  search_term: string;
  search_type: string;
  search_fields: Record<string, string>;
};

export type CandidateDiscoveryResponse = {
  actions: CandidateDiscoveryAction[];
  summary: string;
  disclaimer: string;
};

export type CandidateParseRequest = {
  source: string;
  raw_text: string;
};

export type CandidateParseResponse = {
  candidate: CandidateWork;
  parsed_fields: string[];
  warnings: string[];
};

export type Discrepancy = {
  type: string;
  severity: "low" | "medium" | "high";
  field: string;
  description: string;
  suggested_review_note: string;
};

export type MatchingEvidence = {
  field: string;
  description: string;
  score_impact: number;
};

export type NormalizedComparison = {
  ascap_title: string;
  candidate_title: string;
  ascap_iswc: string | null;
  candidate_iswc: string | null;
  ascap_writers: string[];
  candidate_writers: string[];
  ascap_publishers: string[];
  candidate_publishers: string[];
};

export type CandidateAnalysisResult = {
  candidate: CandidateWork;
  rank: number;
  confidence_score: number;
  confidence_label: string;
  comparison_details: NormalizedComparison;
  matching_evidence: MatchingEvidence[];
  discrepancies: Discrepancy[];
};

export type ReviewDecision = {
  label: "Likely Same Work" | "Needs Manual Review" | "Likely Different Work";
  severity: "success" | "warning" | "danger";
  confidence_score: number;
  rationale: string[];
};

export type AnalyzeResponse = {
  results: CandidateAnalysisResult[];
  top_result: CandidateAnalysisResult | null;
  review_decision: ReviewDecision;
  summary: string;
  report_text: string;
  disclaimer: string;
};

export async function analyzeWork(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Analysis failed with status ${response.status}`);
  }

  return response.json() as Promise<AnalyzeResponse>;
}

export async function discoverCandidates(
  payload: CandidateDiscoveryRequest,
): Promise<CandidateDiscoveryResponse> {
  const response = await fetch("/api/discover-candidates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Discovery failed with status ${response.status}`);
  }

  return response.json() as Promise<CandidateDiscoveryResponse>;
}

export async function parseCandidate(
  payload: CandidateParseRequest,
): Promise<CandidateParseResponse> {
  const response = await fetch("/api/parse-candidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Candidate parsing failed with status ${response.status}`);
  }

  return response.json() as Promise<CandidateParseResponse>;
}
