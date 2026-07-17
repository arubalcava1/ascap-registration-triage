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

export type BrowserAssistedTask = {
  task_id: string;
  source: string;
  url: string;
  search_fields: Record<string, string>;
  instructions: string[];
  status: "requires_user_open" | "waiting_for_visible_content" | "captured";
  requires_user_approval: boolean;
};

export type BrowserAssistedStartRequest = {
  ascap_work: AscapWork;
  performer: string | null;
};

export type BrowserAssistedSession = {
  session_id: string;
  tasks: BrowserAssistedTask[];
  guardrails: string[];
  summary: string;
  disclaimer: string;
};

export type BrowserAssistedCaptureRequest = {
  session_id: string;
  source: string;
  visible_text: string;
  user_approved_capture: boolean;
};

export type BrowserAssistedCaptureResponse = {
  session_id: string;
  source: string;
  parse_result: CandidateParseResponse;
  guardrails: string[];
};

export type BrowserAssistedOpenTaskRequest = {
  session_id: string;
  task_id: string;
};

export type BrowserAssistedOpenTaskResponse = {
  session_id: string;
  task_id: string;
  source: string;
  url: string;
  status: string;
  message: string;
};

export type BrowserAssistedCaptureActivePageRequest = {
  session_id: string;
  source: string;
  user_approved_capture: boolean;
};

export type BrowserAssistedCloseRequest = {
  session_id: string;
};

export type BrowserAssistedCloseResponse = {
  session_id: string;
  closed: boolean;
  message: string;
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
    const detail = await readApiError(response);
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
    const detail = await readApiError(response);
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
    const detail = await readApiError(response);
    throw new Error(detail || `Candidate parsing failed with status ${response.status}`);
  }

  return response.json() as Promise<CandidateParseResponse>;
}

export async function startBrowserAssistedSession(
  payload: BrowserAssistedStartRequest,
): Promise<BrowserAssistedSession> {
  const response = await fetch("/api/browser-assisted/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Browser-assisted session failed with status ${response.status}`);
  }

  return response.json() as Promise<BrowserAssistedSession>;
}

export async function captureBrowserVisibleText(
  payload: BrowserAssistedCaptureRequest,
): Promise<BrowserAssistedCaptureResponse> {
  const response = await fetch("/api/browser-assisted/capture-visible-text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Visible text capture failed with status ${response.status}`);
  }

  return response.json() as Promise<BrowserAssistedCaptureResponse>;
}

export async function openBrowserAssistedTask(
  payload: BrowserAssistedOpenTaskRequest,
): Promise<BrowserAssistedOpenTaskResponse> {
  const response = await fetch("/api/browser-assisted/open-task", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Guided browser open failed with status ${response.status}`);
  }

  return response.json() as Promise<BrowserAssistedOpenTaskResponse>;
}

export async function captureBrowserActivePage(
  payload: BrowserAssistedCaptureActivePageRequest,
): Promise<BrowserAssistedCaptureResponse> {
  const response = await fetch("/api/browser-assisted/capture-active-page", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Active page capture failed with status ${response.status}`);
  }

  return response.json() as Promise<BrowserAssistedCaptureResponse>;
}

export async function closeBrowserAssistedSession(
  payload: BrowserAssistedCloseRequest,
): Promise<BrowserAssistedCloseResponse> {
  const response = await fetch("/api/browser-assisted/close-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Guided browser close failed with status ${response.status}`);
  }

  return response.json() as Promise<BrowserAssistedCloseResponse>;
}

async function readApiError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    return text;
  }

  return text;
}
