const STORAGE_KEY = "ascapTriageExtensionState";
const REFERENCE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MUSICBRAINZ_REQUEST_INTERVAL_MS = 1100;
const WIKIMEDIA_REQUEST_INTERVAL_MS = 250;
const WIKIMEDIA_API_USER_AGENT = "ASCAPRegistrationTriage/0.2 (Chrome extension; public ASCAP metadata triage)";

function createRequestLimiter(intervalMs) {
  let nextRequestAt = 0;
  return async function limitRequest() {
    const now = Date.now();
    const waitMs = Math.max(0, nextRequestAt - now);
    nextRequestAt = Math.max(now, nextRequestAt) + intervalMs;
    if (waitMs > 0) {
      await delay(waitMs);
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const referenceFetchCache = new Map();
const referenceRequestLimiters = {
  musicbrainz: createRequestLimiter(MUSICBRAINZ_REQUEST_INTERVAL_MS),
  wikimedia: createRequestLimiter(WIKIMEDIA_REQUEST_INTERVAL_MS),
  generic: createRequestLimiter(0),
};

const elements = {
  titleInput: document.querySelector("#titleInput"),
  songCodeInput: document.querySelector("#songCodeInput"),
  iswcInput: document.querySelector("#iswcInput"),
  performerInput: document.querySelector("#performerInput"),
  writersInput: document.querySelector("#writersInput"),
  publishersInput: document.querySelector("#publishersInput"),
  themeSelect: document.querySelector("#themeSelect"),
  openAscapButton: document.querySelector("#openAscapButton"),
  fillAscapButton: document.querySelector("#fillAscapButton"),
  captureButton: document.querySelector("#captureButton"),
  clearCandidatesButton: document.querySelector("#clearCandidatesButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  candidateCount: document.querySelector("#candidateCount"),
  captureDiagnostics: document.querySelector("#captureDiagnostics"),
  candidateList: document.querySelector("#candidateList"),
  writerReferenceCard: document.querySelector("#writerReferenceCard"),
  resultsList: document.querySelector("#resultsList"),
  summaryText: document.querySelector("#summaryText"),
  toggleReportButton: document.querySelector("#toggleReportButton"),
  reportPanel: document.querySelector("#reportPanel"),
  reportText: document.querySelector("#reportText"),
  statusMessage: document.querySelector("#statusMessage"),
};

let state = {
  work: {
    title: "",
    song_code: "",
    iswc: "",
    performer: "",
    writers: "",
    publishers: "",
  },
  candidates: [],
  capture_diagnostics: null,
  analysis: null,
  theme: "ascap",
};

let reportOpen = false;

init();

async function init() {
  await loadState();
  bindEvents();
  render();
}

function bindEvents() {
  elements.openAscapButton.addEventListener("click", openAscapSearch);
  elements.fillAscapButton.addEventListener("click", fillAscapSearch);
  elements.captureButton.addEventListener("click", captureCurrentTab);
  elements.clearCandidatesButton.addEventListener("click", clearCandidates);
  elements.analyzeButton.addEventListener("click", analyzeCandidates);
  elements.toggleReportButton.addEventListener("click", toggleReport);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.candidateList.addEventListener("click", handleCandidateListClick);
  elements.resultsList.addEventListener("click", handleResultsListClick);
  elements.themeSelect.addEventListener("change", updateTheme);

  [
    elements.titleInput,
    elements.songCodeInput,
    elements.iswcInput,
    elements.performerInput,
    elements.writersInput,
    elements.publishersInput,
  ].forEach((input) => {
    input.addEventListener("input", () => saveWorkFromInputs({ quiet: true }));
    input.addEventListener("change", () => saveWorkFromInputs({ quiet: true }));
  });
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  state = { ...state, ...(stored[STORAGE_KEY] || {}) };
  applyTheme(state.theme || "ascap");
}

async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function updateTheme() {
  state.theme = elements.themeSelect.value || "ascap";
  applyTheme(state.theme);
  await saveState();
  setStatus(`Theme changed to ${themeLabel(state.theme)}.`);
}

function applyTheme(theme) {
  const validThemes = new Set(["ascap", "warner", "universal", "sony"]);
  document.body.dataset.theme = validThemes.has(theme) ? theme : "ascap";
}

function themeLabel(theme) {
  const labels = {
    ascap: "Default",
    warner: "Gold",
    universal: "Black",
    sony: "Red",
  };
  return labels[theme] || "Default";
}

function saveWorkFromInputs({ quiet = false } = {}) {
  state.work = {
    title: elements.titleInput.value,
    song_code: elements.songCodeInput.value,
    iswc: elements.iswcInput.value,
    performer: elements.performerInput.value,
    writers: elements.writersInput.value,
    publishers: elements.publishersInput.value,
  };
  saveState();
  if (!quiet) {
    render();
    setStatus("Work metadata saved.");
  }
}

async function openAscapSearch() {
  saveWorkFromInputs();
  const [search] = buildAscapSearchPlan(state.work);
  if (!search) {
    setStatus("Enter a title, ISWC, ASCAP work ID, performer, writer, or publisher before opening ASCAP search.", true);
    return;
  }
  await chrome.tabs.create({
    url: buildAscapSearchUrl(search),
    active: true,
  });
  setStatus("Opened ASCAP search tab.");
}

async function fillAscapSearch() {
  await fillCurrentTabSearch("ASCAP");
}

async function fillCurrentTabSearch(targetSource) {
  saveWorkFromInputs();
  const [search] = buildAscapSearchPlan(state.work);
  if (!search) {
    setStatus("Enter a title, ISWC, ASCAP work ID, performer, writer, or publisher before filling search fields.", true);
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.", true);
    return;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillPublicRepertoireSearch,
      args: [
        {
          targetSource,
          title: state.work.title,
          songCode: state.work.song_code,
          iswc: state.work.iswc,
          performer: state.work.performer,
          writer: firstWriterSearchTerm(state.work.writers),
          publisher: firstPublisherSearchTerm(state.work.publishers),
        },
      ],
    });

    if (!result?.ok) {
      setStatus(result?.message || `Could not fill ${targetSource} search fields.`, true);
      return;
    }

    setStatus(result.message);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function captureCurrentTab() {
  saveWorkFromInputs();

  setBusy(elements.captureButton, true, "Capturing...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisibleRepertoireResults,
    });

    if (!result?.results?.length) {
      state.capture_diagnostics = buildFailedCaptureDiagnostics(result);
      await saveState();
      render();
      throw new Error(result?.message || "No ASCAP repertoire results were captured from this tab.");
    }

    const parsedCandidates = [];
    const parseDiagnostics = [];
    for (const capturedResult of result.results) {
      let parsed;
      try {
        parsed = parseCandidateText("ASCAP Repertory", capturedResult.text);
      } catch (error) {
        throw new Error(`Could not parse captured ASCAP result ${capturedResult.index + 1}: ${error.message}`);
      }
      parsedCandidates.push({
        ...parsed.candidate,
        source_url: result.url,
        raw_notes: parsed.candidate.raw_notes || capturedResult.text,
      });
      parseDiagnostics.push({
        index: capturedResult.index + 1,
        title: parsed.candidate.title,
        public_work_id: parsed.candidate.public_work_id,
        parsed_fields: parsed.parsed_fields,
        warnings: parsed.warnings,
      });
    }

    const mergeResult = mergeCandidates(state.candidates, parsedCandidates);
    state.candidates = mergeResult.candidates;
    state.capture_diagnostics = {
      found: result.diagnostics?.found || result.results.length,
      captured: result.results.length,
      parsed: parsedCandidates.length,
      added: mergeResult.added,
      duplicates: mergeResult.duplicates,
      expand_clicks: result.diagnostics?.expand_clicks || 0,
      parse_details: parseDiagnostics,
    };
    state.analysis = null;
    await saveState();
    render();
    setStatus(`Captured ${parsedCandidates.length} ASCAP result(s); ${mergeResult.added} new candidate(s).`);

    if (state.work.title.trim() && state.candidates.length > 0) {
      await runAnalysis();
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(elements.captureButton, false, "Capture and analyze");
  }
}

async function analyzeCandidates() {
  saveWorkFromInputs();

  if (!state.work.title.trim()) {
    setStatus("Enter the ASCAP work title first.", true);
    return;
  }
  if (state.candidates.length === 0) {
    setStatus("Capture at least one public candidate first.", true);
    return;
  }

  await runAnalysis();
}

async function runAnalysis() {
  setBusy(elements.analyzeButton, true, "Analyzing...");
  try {
    const analysis = await analyzeCandidatesLocally(buildAscapWork(), state.candidates);
    state.analysis = analysis;
    reportOpen = false;
    await saveState();
    render();
    setStatus("Analysis complete.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(elements.analyzeButton, false, "Analyze");
  }
}

async function clearCandidates() {
  state.candidates = [];
  state.capture_diagnostics = null;
  state.analysis = null;
  reportOpen = false;
  await saveState();
  render();
  setStatus("Candidates cleared.");
}

async function removeCandidate(index) {
  const candidate = state.candidates[index];
  if (!candidate) {
    return;
  }
  state.candidates = state.candidates.filter((_, candidateIndex) => candidateIndex !== index);
  state.analysis = null;
  reportOpen = false;
  await saveState();
  render();
  setStatus(`Removed candidate: ${candidate.title || "Untitled candidate"}.`);
}

function handleCandidateListClick(event) {
  const button = event.target.closest("[data-remove-candidate]");
  if (!button) {
    return;
  }
  const index = Number.parseInt(button.dataset.removeCandidate, 10);
  if (Number.isInteger(index)) {
    removeCandidate(index);
  }
}

async function handleResultsListClick(event) {
  const button = event.target.closest("[data-copy-work-id]");
  if (!button) {
    return;
  }
  const workId = button.dataset.copyWorkId;
  if (!workId) {
    return;
  }
  await navigator.clipboard.writeText(workId);
  setStatus(`Copied ASCAP Work ID ${workId}.`);
}

async function copyReport() {
  if (!state.analysis?.report_text) {
    setStatus("No report to copy yet.", true);
    return;
  }
  await navigator.clipboard.writeText(state.analysis.report_text);
  setStatus("Report copied.");
}

function toggleReport() {
  if (!state.analysis?.report_text) {
    setStatus("No report to show yet.", true);
    return;
  }
  reportOpen = !reportOpen;
  renderReportVisibility();
}

function buildAscapWork() {
  return {
    title: state.work.title.trim(),
    song_code: optional(state.work.song_code),
    iswc: optional(state.work.iswc),
    performer: optional(state.work.performer),
    alternate_titles: [],
    writers: parseParties(state.work.writers),
    publishers: parseParties(state.work.publishers),
    source_url: null,
    notes: null,
  };
}

function parseParties(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      name: line.replace(/\s+\|\s*\d+(?:\.\d+)?\s*%?\s*$/, "").trim(),
      ipi_cae: null,
      share: null,
    }))
    .filter((party) => party.name);
}

function render() {
  elements.titleInput.value = state.work.title || "";
  elements.songCodeInput.value = state.work.song_code || "";
  elements.iswcInput.value = state.work.iswc || "";
  elements.performerInput.value = state.work.performer || "";
  elements.writersInput.value = state.work.writers || "";
  elements.publishersInput.value = state.work.publishers || "";
  elements.themeSelect.value = state.theme || "ascap";
  applyTheme(state.theme || "ascap");

  elements.candidateCount.textContent =
    state.candidates.length === 0
      ? "No candidates captured."
      : `Ready: ${state.candidates.length} ASCAP candidate(s) captured.`;
  elements.analyzeButton.disabled = state.candidates.length === 0;
  renderCaptureDiagnostics();

  elements.candidateList.innerHTML = state.candidates
    .map(
      (candidate, index) => `
        <article class="item">
          <div class="item-title">
            <span class="item-name">${escapeHtml(index + 1)}. ${escapeHtml(candidate.title)}</span>
            <span>${escapeHtml(candidate.source)}</span>
          </div>
          <div class="item-meta item-meta--action">
            <span>${escapeHtml(candidate.public_work_id || "No public ID")} - ${escapeHtml(candidate.iswc || "No ISWC")}</span>
            <button class="remove-button" type="button" data-remove-candidate="${escapeHtml(index)}">Remove</button>
          </div>
          <div class="party-summary">
            <div>
              <span class="summary-label">Writers</span>
              <span>${escapeHtml(formatPartySummary(candidate.writers))}</span>
            </div>
            <div>
              <span class="summary-label">Publishers</span>
              <span>${escapeHtml(formatPartySummary(candidate.publishers))}</span>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  if (!state.analysis) {
    elements.summaryText.textContent = "Run analysis after capturing candidates.";
    elements.writerReferenceCard.classList.add("hidden");
    elements.writerReferenceCard.innerHTML = "";
    elements.resultsList.innerHTML = "";
    elements.reportText.textContent = "";
    elements.copyReportButton.disabled = true;
    elements.toggleReportButton.disabled = true;
    reportOpen = false;
    renderReportVisibility();
    return;
  }

  elements.summaryText.textContent = state.analysis.summary;
  elements.reportText.textContent = state.analysis.report_text;
  elements.copyReportButton.disabled = !state.analysis.report_text;
  elements.toggleReportButton.disabled = !state.analysis.report_text;
  renderWriterReferenceCard(state.analysis.external_writer_reference);
  renderReportVisibility();
  elements.resultsList.innerHTML = state.analysis.results
    .map(
      (result) => `
        <article class="item">
          <div class="item-title">
            <span class="item-name">Rank ${escapeHtml(result.rank)} - ${escapeHtml(result.candidate.title)}</span>
            <span class="score">${escapeHtml(result.confidence_label)}</span>
          </div>
          <div class="item-meta">${escapeHtml(result.candidate.source)}${formatIdentifierMetaClean(result)}</div>
          ${renderReferenceAlignment(result)}
          ${renderRankReason(result)}
          ${renderWriterReview(result)}
          ${renderIdentifierReview(result)}
          ${renderEvidenceReview(result)}
        </article>
      `,
    )
    .join("");
}

function renderWriterReferenceCard(reference) {
  if (!reference) {
    elements.writerReferenceCard.classList.remove("hidden");
    elements.writerReferenceCard.innerHTML = `
      <div class="reference-heading">
        <span>Public writer reference</span>
        <strong>Skipped</strong>
      </div>
      <div class="muted-line">No public writer reference was used for this analysis.</div>
    `;
    return;
  }

  const status = reference.lookup_status || "unknown";
  const writers = reference.writers || [];
  const sources = reference.sources || [];
  const sourceExplanation = referenceSourceExplanation(sources, status);
  elements.writerReferenceCard.classList.remove("hidden");
  elements.writerReferenceCard.innerHTML = `
    <div class="reference-heading">
      <span>Public writer reference</span>
      <strong>${escapeHtml(formatReferenceStatus(status))}</strong>
    </div>
    ${
      sources.length
        ? `<div class="reference-meta">Source${sources.length === 1 ? "" : "s"}: ${escapeHtml(sources.join(", "))}</div>`
        : `<div class="reference-meta">No source returned a usable writer set.</div>`
    }
    ${sourceExplanation ? `<div class="muted-line">${escapeHtml(sourceExplanation)}</div>` : ""}
    ${
      writers.length
        ? `<div class="reference-writers">${writers.map((writer) => `<span>${escapeHtml(writer)}</span>`).join("")}</div>`
        : `<div class="muted-line">No public writer names were found.</div>`
    }
    <div class="muted-line">Advisory public metadata only. Use it to support review, not replace ASCAP verification.</div>
  `;
}

function referenceSourceExplanation(sources = [], status = "") {
  if (status !== "found") {
    return "";
  }

  const normalizedSources = sources.map((source) => String(source).toLowerCase());
  if (normalizedSources.some((source) => source.includes("captured ascap"))) {
    return "External metadata did not return a usable writer set, so this used captured ASCAP public repertoire writers.";
  }
  if (sources.length) {
    return "Used documented public metadata sources before comparing against captured ASCAP candidates.";
  }
  return "";
}

function formatReferenceStatus(status) {
  const labels = {
    found: "Found",
    not_found: "Not found",
    skipped: "Skipped",
  };
  return labels[status] || "Checked";
}

function renderReferenceAlignment(result) {
  const referenceEvidence = result.matching_evidence.some((item) => item.field === "external_writers");
  const referenceIssues = result.discrepancies.filter((item) => item.field === "external_writers");

  if (!referenceEvidence && !referenceIssues.length) {
    return "";
  }

  if (!referenceIssues.length) {
    return `<div class="reference-result reference-result--match">Public writer reference aligned.</div>`;
  }

  return `<div class="reference-result reference-result--warning">Public writer reference mismatch: ${escapeHtml(referenceIssues.length)} item(s).</div>`;
}

function renderReportVisibility() {
  const hasReport = Boolean(state.analysis?.report_text);
  elements.reportPanel.classList.toggle("hidden", !hasReport || !reportOpen);
  elements.toggleReportButton.textContent = reportOpen ? "Hide report" : "Show report";
  elements.toggleReportButton.setAttribute("aria-expanded", reportOpen ? "true" : "false");
}

function renderCaptureDiagnostics() {
  const diagnostics = state.capture_diagnostics;
  if (!diagnostics?.recovery_notes?.length) {
    elements.captureDiagnostics.classList.add("hidden");
    elements.captureDiagnostics.innerHTML = "";
    return;
  }

  const recoveryLines = (diagnostics.recovery_notes || [])
    .map((note) => `<div class="diagnostic-row"><span>Capture note</span><span>${escapeHtml(note)}</span></div>`)
    .join("");

  elements.captureDiagnostics.classList.remove("hidden");
  elements.captureDiagnostics.innerHTML = `
    <div class="diagnostic-issues">${recoveryLines}</div>
  `;
}

function buildFailedCaptureDiagnostics(result) {
  return {
    found: result?.diagnostics?.found || 0,
    captured: 0,
    parsed: 0,
    added: 0,
    duplicates: 0,
    expand_clicks: result?.diagnostics?.expand_clicks || 0,
    parse_details: [],
    recovery_notes: captureRecoveryNotes(result),
  };
}

function captureRecoveryNotes(result) {
  const notes = [];
  const diagnostics = result?.diagnostics || {};
  if (!diagnostics.has_identifiers) {
    notes.push("No visible ASCAP Work ID / ISWC pattern was detected. Wait for results to finish loading, then try again.");
  }
  if (!diagnostics.has_result_words) {
    notes.push("The active tab does not look like an ASCAP result page yet. Make sure you are on the public repertoire results page.");
  }
  if ((diagnostics.expand_clicks || 0) === 0) {
    notes.push("No visible Expand button was found. If ASCAP shows collapsed works, scroll near the result cards and try again.");
  }
  return notes.length ? notes : ["ASCAP content was visible, but no complete work block was captured. Wait a moment, then retry capture."];
}

function formatCaptureDiagnosticTitle(item) {
  const title = item.title || `Result ${item.index}`;
  const id = item.public_work_id ? ` - ${item.public_work_id}` : "";
  return `${item.index}. ${title}${id}`;
}

function formatCaptureDiagnosticDetail(item) {
  const parsedFields = item.parsed_fields?.length ? `Parsed: ${item.parsed_fields.join(", ")}` : "No fields parsed";
  const warnings = item.warnings?.length ? ` Warnings: ${item.warnings.join(" ")}` : "";
  return `${parsedFields}.${warnings}`;
}

function formatIdentifierMeta(result) {
  const pieces = [];
  if (result.candidate.public_work_id) {
    pieces.push(`ASCAP Work ID ${result.candidate.public_work_id}`);
  }
  if (state.work.iswc?.trim() && result.candidate.iswc) {
    pieces.push(`ISWC ${result.candidate.iswc}`);
  }
  return pieces.length ? ` · ${escapeHtml(pieces.join(" · "))}` : "";
}

function formatIdentifierMetaClean(result) {
  const workId = result.candidate.public_work_id;
  const pieces = [];
  if (workId) {
    pieces.push(`
      <span class="work-id-chip">
        <span>ASCAP Work ID ${escapeHtml(workId)}</span>
        <button class="copy-id-button" type="button" data-copy-work-id="${escapeHtml(workId)}">Copy ID</button>
      </span>
    `);
  }
  if (state.work.iswc?.trim() && result.candidate.iswc) {
    pieces.push(`<span>ISWC ${escapeHtml(result.candidate.iswc)}</span>`);
  }
  return pieces.length ? `<span class="identifier-meta"> - ${pieces.join(" - ")}</span>` : "";
}

function renderRankReason(result) {
  const summary = buildRankReason(result);
  const issues = buildRankIssueSummary(result);
  return `
    <div class="review-block rank-reason">
      <div class="review-title">Ranking summary</div>
      <div class="match-line">${escapeHtml(summary)}</div>
      ${issues ? `<div class="warning-line">Review: ${escapeHtml(issues)}</div>` : ""}
    </div>
  `;
}

function buildRankReason(result) {
  const titleMatched = result.comparison_details.ascap_title === result.comparison_details.candidate_title;
  const matchedWriters = buildMatchedWriterPairs(
    result.comparison_details.ascap_writers || [],
    result.comparison_details.candidate_writers || [],
  );
  const searchedWriterCount = result.comparison_details.ascap_writers?.length || 0;
  const parts = [];

  parts.push(titleMatched ? "Title matched" : "Title is similar");
  if (searchedWriterCount) {
    parts.push(`${matchedWriters.length}/${searchedWriterCount} searched writer${searchedWriterCount === 1 ? "" : "s"} matched`);
  } else {
    parts.push("No searched writer entered");
  }
  if (hasProvidedIdentifierEvidence(result)) {
    parts.push("Provided identifier matched");
  }
  const referenceSummary = buildReferenceSummary(result);
  if (referenceSummary) {
    parts.push(referenceSummary);
  }
  return parts.join(". ") + ".";
}

function buildRankIssueSummary(result) {
  const writerDiscrepancies = result.discrepancies.filter((item) => ["writers", "external_writers"].includes(item.field));
  const missingWriters = extractNamesFromDiscrepancies(writerDiscrepancies.filter((item) => item.type === "missing_writer"));
  const extraWriters = extractNamesFromDiscrepancies(writerDiscrepancies.filter((item) => item.type === "extra_writer"));
  const missingReferenceWriters = extractNamesFromDiscrepancies(
    writerDiscrepancies.filter((item) => item.type === "missing_reference_writer"),
  );
  const extraReferenceWriters = extractNamesFromDiscrepancies(
    writerDiscrepancies.filter((item) => item.type === "extra_reference_writer"),
  );
  const issues = [];
  if (missingWriters.length) {
    issues.push(`${missingWriters.length} searched writer${missingWriters.length === 1 ? "" : "s"} missing`);
  }
  if (extraWriters.length) {
    issues.push(`${extraWriters.length} extra candidate writer${extraWriters.length === 1 ? "" : "s"}`);
  }
  if (missingReferenceWriters.length) {
    issues.push(`${missingReferenceWriters.length} public reference writer${missingReferenceWriters.length === 1 ? "" : "s"} missing`);
  }
  if (extraReferenceWriters.length) {
    issues.push(`${extraReferenceWriters.length} writer${extraReferenceWriters.length === 1 ? "" : "s"} not in public reference`);
  }
  return issues.join("; ");
}

function buildReferenceSummary(result) {
  const hasReferenceEvidence = result.matching_evidence.some((item) => item.field === "external_writers");
  const referenceIssues = result.discrepancies.filter((item) => item.field === "external_writers");

  if (hasReferenceEvidence && !referenceIssues.length) {
    return "Public writer reference aligned";
  }
  if (referenceIssues.length) {
    return "Public writer reference needs review";
  }
  return "";
}

function hasProvidedIdentifierEvidence(result) {
  const comparableFields = [];
  if (state.work.song_code?.trim()) comparableFields.push("song_code");
  if (state.work.iswc?.trim()) comparableFields.push("iswc");
  return result.matching_evidence.some((item) => comparableFields.includes(item.field));
}

function renderWriterReview(result) {
  const writerDiscrepancies = result.discrepancies.filter((item) => ["writers", "external_writers"].includes(item.field));
  const missingWriters = writerDiscrepancies.filter((item) => item.type === "missing_writer");
  const extraWriters = writerDiscrepancies.filter((item) => item.type === "extra_writer");
  const missingReferenceWriters = writerDiscrepancies.filter((item) => item.type === "missing_reference_writer");
  const extraReferenceWriters = writerDiscrepancies.filter((item) => item.type === "extra_reference_writer");
  const matchedPairs = buildMatchedWriterPairs(
    result.comparison_details.ascap_writers || [],
    result.comparison_details.candidate_writers || [],
  );

  return `
    <div class="review-block">
      <div class="review-title">Writer check</div>
      ${matchedPairs.length ? `<div class="match-lines">${matchedPairs.map((pair) => `<span>${escapeHtml(pair)}</span>`).join("")}</div>` : `<div class="muted-line">No writer matches found.</div>`}
      ${missingWriters.length ? `<div class="warning-line">Missing: ${escapeHtml(extractNamesFromDiscrepancies(missingWriters).join(", "))}</div>` : ""}
      ${extraWriters.length ? `<div class="warning-line">Extra: ${escapeHtml(extractNamesFromDiscrepancies(extraWriters).join(", "))}</div>` : ""}
      ${missingReferenceWriters.length ? `<div class="warning-line">Missing public reference: ${escapeHtml(extractNamesFromDiscrepancies(missingReferenceWriters).join(", "))}</div>` : ""}
      ${extraReferenceWriters.length ? `<div class="warning-line">Not in public reference: ${escapeHtml(extractNamesFromDiscrepancies(extraReferenceWriters).join(", "))}</div>` : ""}
    </div>
  `;
}

function renderIdentifierReview(result) {
  const relevantFields = [];
  if (state.work.song_code?.trim()) relevantFields.push("song_code");
  if (state.work.iswc?.trim()) relevantFields.push("iswc");
  if (!relevantFields.length) {
    return "";
  }

  const identifierDiscrepancies = result.discrepancies.filter((item) => relevantFields.includes(item.field));
  const identifierEvidence = result.matching_evidence.filter((item) => relevantFields.includes(item.field));

  return `
    <div class="review-block">
      <div class="review-title">Identifier check</div>
      ${identifierEvidence.length ? identifierEvidence.map((item) => `<div class="match-line">${escapeHtml(item.description)}</div>`).join("") : ""}
      ${identifierDiscrepancies.length ? identifierDiscrepancies.map((item) => `<div class="warning-line">${escapeHtml(item.description)}</div>`).join("") : ""}
      ${!identifierEvidence.length && !identifierDiscrepancies.length ? `<div class="muted-line">No comparable identifier was found on this candidate.</div>` : ""}
    </div>
  `;
}

function renderEvidenceReview(result) {
  const nonWriterDiscrepancies = result.discrepancies.filter(
    (item) => !["writers", "external_writers", "iswc", "song_code"].includes(item.field),
  );
  const evidence = result.matching_evidence.filter((item) => !["iswc", "song_code"].includes(item.field));
  return `
    <div class="item-body">
      ${escapeHtml(evidence.length)} matching signal(s). ${escapeHtml(nonWriterDiscrepancies.length)} other review item(s).
    </div>
  `;
}

function buildMatchedWriterPairs(ascapWriters, candidateWriters) {
  const pairs = [];
  const usedCandidates = new Set();
  ascapWriters.forEach((ascapWriter) => {
    const match = bestNameMatch(ascapWriter, candidateWriters, usedCandidates);
    if (match.score >= 0.88) {
      usedCandidates.add(match.index);
      pairs.push(`${ascapWriter} -> ${match.name}`);
    }
  });
  return pairs;
}

function bestNameMatch(name, candidates, usedCandidates) {
  return candidates.reduce(
    (best, candidate, index) => {
      if (usedCandidates.has(index)) return best;
      const score = nameSimilarity(name, candidate);
      return score > best.score ? { name: candidate, score, index } : best;
    },
    { name: "", score: 0, index: -1 },
  );
}

function nameSimilarity(left, right) {
  return localNameSimilarity(left, right);
}

function nameTokens(value) {
  return new Set(
    String(value)
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function isSubset(left, right) {
  return [...left].every((token) => right.has(token));
}

function extractNamesFromDiscrepancies(discrepancies) {
  return discrepancies.map((item) => item.description.match(/'([^']+)'/)?.[1] || item.description);
}

const DISCLAIMER =
  "This analysis is a metadata triage signal only. It is not an official ASCAP determination, legal ownership conclusion, royalty calculation, or automatic registration fix.";

function parseCandidateText(source, rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(cleanParseLine)
    .filter(Boolean);
  let title = "";
  let publicWorkId = null;
  let iswc = null;
  let status = null;
  const writers = [];
  const publishers = [];
  const parsedFields = new Set();
  let currentSection = null;

  for (const line of lines) {
    if (isArtifactLine(line)) continue;

    const idMatch = line.match(/\bWork ID\s*:?\s*(\d{5,10})\b/i);
    if (idMatch) {
      publicWorkId = publicWorkId || idMatch[1];
      parsedFields.add("public_work_id");
    }

    const iswcMatch = line.match(/\b(T[-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[-\s]?\d)\b/i);
    if (iswcMatch) {
      iswc = iswc || iswcMatch[1];
      parsedFields.add("iswc");
    }

    const explicitTitle = line.match(/^(?:work\s*)?title\s*[:\-]\s*(.+)$/i);
    if (explicitTitle) {
      title = explicitTitle[1].trim();
      parsedFields.add("title");
      currentSection = null;
      continue;
    }

    const explicitId = line.match(/^(?:public\s*)?(?:work\s*)?(?:id|code|number)\s*[:\-]\s*(.+)$/i);
    if (explicitId && !publicWorkId) {
      publicWorkId = explicitId[1].trim();
      parsedFields.add("public_work_id");
      currentSection = null;
      continue;
    }

    if (/^writers?\s*:?\s*$/i.test(line) || /^songwriters?\s*:?\s*$/i.test(line) || /^writers?\s*\/\s*composers?\s*:?\s*$/i.test(line)) {
      currentSection = "writer";
      continue;
    }
    if (/^publishers?\s*:?\s*$/i.test(line)) {
      currentSection = "publisher";
      continue;
    }
    if (/^(performers?|alternate\s+titles?)\s*:?\s*$/i.test(line)) {
      currentSection = null;
      continue;
    }

    const inlineWriters = inlineParties(line, "writer");
    if (inlineWriters.length) {
      writers.push(...inlineWriters);
      parsedFields.add("writers");
      currentSection = null;
      continue;
    }
    const inlinePublishers = inlineParties(line, "publisher");
    if (inlinePublishers.length) {
      publishers.push(...inlinePublishers);
      parsedFields.add("publishers");
      currentSection = null;
      continue;
    }

    if (currentSection === "writer" || currentSection === "publisher") {
      const party = partyFromLine(line);
      if (party) {
        if (currentSection === "writer") {
          writers.push(party);
          parsedFields.add("writers");
        } else {
          publishers.push(party);
          parsedFields.add("publishers");
        }
      }
    }
  }

  if (!title) {
    title = inferCandidateTitle(lines, source);
    if (title) parsedFields.add("title");
  }

  const warnings = [];
  if (!title) {
    title = "Untitled candidate";
    warnings.push("Could not confidently parse a title.");
  }
  if (!writers.length) warnings.push("No writers were parsed from the pasted text.");
  if (!publishers.length) warnings.push("No publishers were parsed from the pasted text.");
  if (!iswc) warnings.push("No ISWC was parsed from the pasted text.");

  return {
    candidate: {
      source,
      title,
      public_work_id: publicWorkId,
      iswc,
      alternate_titles: [],
      writers: uniqueParties(writers),
      publishers: uniqueParties(publishers),
      status,
      source_url: null,
      raw_notes: rawText,
    },
    parsed_fields: Array.from(parsedFields).sort(),
    warnings,
  };
}

function inlineParties(line, type) {
  const match = line.match(new RegExp(`^${type}s?\\s*[:\\-]\\s*(.+)$`, "i"));
  if (!match) return [];
  return match[1]
    .split(/[;,]/)
    .map((part) => partyFromLine(part))
    .filter(Boolean);
}

function partyFromLine(line) {
  let name = cleanParseLine(line)
    .replace(/^(?:writer|publisher|composer|author)\s*[:\-]\s*/i, "")
    .replace(/\s+\|\s*\d+(?:\.\d+)?\s*%?\s*$/i, "")
    .replace(/\(?\b\d+(?:\.\d+)?\s*%\)?/g, "")
    .replace(/\b(?:BMI|ASCAP|SESAC|GMR)\b/g, "")
    .replace(/\bshare\b/gi, "")
    .replace(/\b\d{6,}\b/g, "")
    .replace(/\s+[-|]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || isArtifactLine(name) || /^[:|.\-\s\d%]+$/.test(name)) return null;
  return { name, ipi_cae: null, share: null };
}

function inferCandidateTitle(lines, source) {
  if (/ascap/i.test(source)) {
    for (let index = 0; index < lines.length; index += 1) {
      if (/\bISWC\b/i.test(lines[index]) || /\bWork ID\b/i.test(lines[index])) {
        for (let previous = index - 1; previous >= 0; previous -= 1) {
          const line = lines[previous];
          if (!isArtifactLine(line) && !looksLikePartyRow(line) && !looksLikeShareLine(line)) return line;
        }
      }
    }
  }
  return lines.find((line) => !isArtifactLine(line) && !/\b(?:ISWC|Work ID)\b/i.test(line)) || "";
}

function cleanParseLine(line) {
  return String(line || "").replace(/\s+/g, " ").trim();
}

function isArtifactLine(line) {
  const normalized = cleanParseLine(line).toLowerCase();
  if (!normalized) return true;
  const artifacts = new Set([
    "% controlled",
    "additional info",
    "additional non-bmi publishers",
    "affiliation",
    "collapse",
    "collapse all",
    "contact info",
    "controlled",
    "expand",
    "help",
    "include alternate titles",
    "logo",
    "name affiliation ipi #",
    "no data available",
    "no information found",
    "performer",
    "print",
    "print all",
    "pro ipi",
    "total %",
    "title",
    "writer / composer",
  ]);
  return (
    artifacts.has(normalized) ||
    normalized.startsWith("title bmi work id") ||
    normalized.startsWith("iswc work id") ||
    normalized.startsWith("songview") ||
    normalized.startsWith("total current ascap share") ||
    normalized.startsWith("total current bmi share") ||
    (normalized.includes("controls:") && (normalized.includes("ascap") || normalized.includes("bmi")))
  );
}

function looksLikePartyRow(line) {
  return /^.+?\s+(BMI|ASCAP|SESAC|GMR)\s+\d{7,10}$/i.test(line);
}

function looksLikeShareLine(line) {
  const value = line.toLowerCase();
  return value.includes("share") || value.includes("controls:") || value.includes("% controlled");
}

function uniqueParties(parties) {
  const seen = new Set();
  return parties.filter((party) => {
    const key = normalizeName(party.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyzeCandidatesLocally(ascapWork, candidates) {
  const writerReference = await maybeLookupWriterReference(ascapWork, candidates);
  const results = candidates
    .map((candidate) => {
      const { score, evidence } = scoreCandidate(ascapWork, candidate, writerReference);
      const discrepancies = detectDiscrepancies(ascapWork, candidate, writerReference);
      return {
        candidate,
        rank: 0,
        confidence_score: score,
        confidence_label: confidenceLabel(score),
        comparison_details: buildComparisonDetails(ascapWork, candidate),
        matching_evidence: evidence,
        discrepancies,
      };
    })
    .sort((left, right) => right.confidence_score - left.confidence_score)
    .map((result, index) => ({ ...result, rank: index + 1 }));
  const topResult = results[0] || null;
  const reviewDecision = reviewDecisionFor(topResult);
  const externalWriterReference = writerReference
    ? {
        lookup_status: writerReference.lookup_status,
        sources: writerReference.sources,
        writers: uniqueNames(writerReference.writers),
        notes: writerReference.notes || null,
      }
    : null;
  const reportText = generateReportText(ascapWork, results, reviewDecision, externalWriterReference);

  return {
    results,
    top_result: topResult,
    review_decision: reviewDecision,
    external_writer_reference: externalWriterReference,
    summary: topResult
      ? `Analyzed ${results.length} candidate record(s). Top candidate is ranked as ${topResult.confidence_label}.`
      : "No candidate records were analyzed.",
    report_text: reportText,
    disclaimer: DISCLAIMER,
  };
}

function scoreCandidate(ascapWork, candidate, writerReference) {
  const evidence = [];
  const weighted = [];
  addWeighted(weighted, evidence, "title", scoreTitle(ascapWork, candidate), 20, "Title similarity supports this candidate");
  if (normalizeIdentifier(ascapWork.song_code)) {
    addWeighted(weighted, evidence, "song_code", scoreSongCode(ascapWork, candidate), 20, "ASCAP song code comparison supports this candidate");
  }
  if (normalizeIswc(ascapWork.iswc)) {
    addWeighted(weighted, evidence, "iswc", scoreIswc(ascapWork, candidate), 20, "ISWC comparison supports this candidate");
  }
  addWeighted(weighted, evidence, "writers", scorePartyNameOverlap(ascapWork.writers, candidate.writers), 35, "Writer name similarity supports this candidate");
  if (writerReference?.writers?.length) {
    addWeighted(weighted, evidence, "external_writers", scoreReferenceWriterMatch(candidate, writerReference), 45, "Public writer reference supports this candidate");
  }
  if (ascapWork.publishers?.length) {
    addWeighted(weighted, evidence, "publishers", scorePartyNameOverlap(ascapWork.publishers, candidate.publishers, true), 10, "Publisher similarity supports this candidate");
  }
  const weight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const base = weight ? weighted.reduce((sum, item) => sum + item.score * item.weight, 0) / weight * 100 : 0;
  return {
    score: roundScore(Math.max(0, base - writerSetPenalty(ascapWork, candidate, writerReference))),
    evidence,
  };
}

function addWeighted(weighted, evidence, field, score, weight, description) {
  weighted.push({ score, weight });
  const impact = roundScore(score * weight);
  if (impact > 0) evidence.push({ field, description, score_impact: impact });
}

function scoreTitle(ascapWork, candidate) {
  const ascapTitles = [ascapWork.title, ...(ascapWork.alternate_titles || [])].map(normalizeTitle).filter(Boolean);
  const candidateTitles = [candidate.title, ...(candidate.alternate_titles || [])].map(normalizeTitle).filter(Boolean);
  if (!ascapTitles.length || !candidateTitles.length) return 0;
  return Math.max(...ascapTitles.flatMap((title) => candidateTitles.map((candidateTitle) => tokenSortRatio(title, candidateTitle))));
}

function scoreIswc(ascapWork, candidate) {
  const ascapIswc = normalizeIswc(ascapWork.iswc);
  const candidateIswc = normalizeIswc(candidate.iswc);
  return ascapIswc && candidateIswc && ascapIswc === candidateIswc ? 1 : 0;
}

function scoreSongCode(ascapWork, candidate) {
  const ascapCode = normalizeIdentifier(ascapWork.song_code);
  const candidateId = normalizeIdentifier(candidate.public_work_id);
  return ascapCode && candidateId && ascapCode === candidateId ? 1 : 0;
}

function scorePartyNameOverlap(ascapParties, candidateParties, publisher = false) {
  const ascapNames = normalizedPartyNames(ascapParties, publisher);
  const candidateNames = normalizedPartyNames(candidateParties, publisher);
  if (!ascapNames.length || !candidateNames.length) return 0;
  const recall = average(ascapNames.map((name) => bestLocalNameSimilarity(name, candidateNames)));
  const precision = average(candidateNames.map((name) => bestLocalNameSimilarity(name, ascapNames)));
  const recallWeight = !publisher && ascapNames.length === 1 ? 0.95 : publisher ? 0.55 : 0.65;
  return recall * recallWeight + precision * (1 - recallWeight);
}

function scoreReferenceWriterMatch(candidate, writerReference) {
  const { matched, missing, extra } = candidateReferenceMatches(candidate, writerReference);
  const expectedCount = uniqueNames(writerReference.writers).length || 1;
  const candidateCount = normalizedPartyNames(candidate.writers).length || 1;
  const recall = matched.length / expectedCount;
  const precision = Math.max(0, 1 - extra.length / candidateCount);
  const missingPenalty = missing.length / expectedCount;
  return Math.max(0, Math.min(1, recall * 0.75 + precision * 0.25 - missingPenalty * 0.35));
}

function writerSetPenalty(ascapWork, candidate, writerReference) {
  if (writerReference?.writers?.length) {
    const { missing, extra } = candidateReferenceMatches(candidate, writerReference);
    return (missing.length / Math.max(uniqueNames(writerReference.writers).length, 1)) * 55 + (extra.length / Math.max(candidate.writers.length, 1)) * 50;
  }
  const ascapNames = normalizedPartyNames(ascapWork.writers);
  const candidateNames = normalizedPartyNames(candidate.writers);
  if (!ascapNames.length || !candidateNames.length) return 0;
  const missingRatio = lowMatchRatio(ascapNames, candidateNames);
  if (ascapNames.length === 1) return missingRatio * 45;
  return missingRatio * 45 + lowMatchRatio(candidateNames, ascapNames) * 70;
}

function detectDiscrepancies(ascapWork, candidate, writerReference) {
  const discrepancies = [];
  if (normalizeTitle(ascapWork.title) && normalizeTitle(candidate.title) && normalizeTitle(ascapWork.title) !== normalizeTitle(candidate.title)) {
    discrepancies.push({
      type: tokenSortRatio(normalizeTitle(ascapWork.title), normalizeTitle(candidate.title)) >= 0.88 ? "title_formatting_difference" : "title_difference",
      severity: "medium",
      field: "title",
      description: "Candidate title differs from the ASCAP portal title.",
      suggested_review_note: "Confirm whether the candidate is an alternate title or a different work.",
    });
  }
  if (normalizeIdentifier(ascapWork.song_code) && normalizeIdentifier(candidate.public_work_id) && normalizeIdentifier(ascapWork.song_code) !== normalizeIdentifier(candidate.public_work_id)) {
    discrepancies.push({
      type: "song_code_mismatch",
      severity: "high",
      field: "song_code",
      description: "ASCAP song code and candidate public work ID are different.",
      suggested_review_note: "Verify the ASCAP song code against the public work ID before treating this candidate as a match.",
    });
  }
  if (normalizeIswc(ascapWork.iswc) && normalizeIswc(candidate.iswc) && normalizeIswc(ascapWork.iswc) !== normalizeIswc(candidate.iswc)) {
    discrepancies.push({
      type: "iswc_mismatch",
      severity: "high",
      field: "iswc",
      description: "ASCAP portal metadata and candidate metadata show different ISWC values.",
      suggested_review_note: "Verify the ISWC in both records before treating this candidate as a match.",
    });
  }
  if (writerReference?.writers?.length) {
    const { missing, extra } = candidateReferenceMatches(candidate, writerReference);
    missing.forEach((writer) => discrepancies.push({
      type: "missing_reference_writer",
      severity: "high",
      field: "external_writers",
      description: `Candidate is missing public reference writer '${writer}'.`,
      suggested_review_note: "Review this candidate against the public writer reference before treating it as the likely match.",
    }));
    extra.forEach((writer) => discrepancies.push({
      type: "extra_reference_writer",
      severity: "high",
      field: "external_writers",
      description: `Candidate includes writer '${writer}' not found in the public writer reference.`,
      suggested_review_note: "Review whether this public candidate is a different work or alternate registration.",
    }));
  } else {
    discrepancies.push(...partyDiscrepancies(ascapWork.writers, candidate.writers, "writer"));
  }
  if (ascapWork.publishers?.length) {
    discrepancies.push(...partyDiscrepancies(ascapWork.publishers, candidate.publishers, "publisher"));
  }
  return discrepancies;
}

function partyDiscrepancies(ascapParties, candidateParties, type) {
  const publisher = type === "publisher";
  const ascapNames = normalizedPartyNames(ascapParties, publisher);
  const candidateNames = normalizedPartyNames(candidateParties, publisher);
  const output = [];
  if (!ascapNames.length) return output;
  ascapNames.forEach((name, index) => {
    if (bestLocalNameSimilarity(name, candidateNames) < 0.88) {
      output.push({
        type: `missing_${type}`,
        severity: type === "writer" ? "high" : "medium",
        field: `${type}s`,
        description: `ASCAP metadata includes ${type} '${ascapParties[index].name}' not clearly found in the candidate.`,
        suggested_review_note: `Review whether this ${type} is missing from the candidate record or listed under a variation.`,
      });
    }
  });
  if (type === "writer" && ascapNames.length === 1) return output;
  candidateNames.forEach((name, index) => {
    if (bestLocalNameSimilarity(name, ascapNames) < 0.88) {
      output.push({
        type: `extra_${type}`,
        severity: type === "writer" ? "high" : "medium",
        field: `${type}s`,
        description: `Candidate includes additional ${type} '${candidateParties[index].name}' not clearly found in the ASCAP metadata.`,
        suggested_review_note: `Review whether this additional ${type} should be associated with the work.`,
      });
    }
  });
  return output;
}

async function maybeLookupWriterReference(ascapWork, candidates) {
  if (!shouldLookupWriterReference(ascapWork, candidates)) return null;
  const external = await lookupExternalWriterReference(ascapWork, candidates);
  if (external && referenceMatchesEnteredWriterContext(ascapWork, external.writers)) return external;
  return capturedCandidateWriterReference(ascapWork, candidates) || external;
}

function shouldLookupWriterReference(ascapWork, candidates) {
  return Boolean((ascapWork.title || "").trim() && candidates?.length);
}

async function lookupExternalWriterReference(ascapWork, candidates) {
  const titleVariants = uniqueStrings([ascapWork.title, ...candidates.map((candidate) => candidate.title)]);
  const sourceResults = [];
  for (const title of titleVariants.slice(0, 4)) {
    const wiki = await lookupWikidataWriters(title, ascapWork);
    if (wiki.writers.length) sourceResults.push(wiki);
    const wikipedia = await lookupWikipediaWriters(title, ascapWork);
    if (wikipedia.writers.length) sourceResults.push(wikipedia);
    const musicbrainz = await lookupMusicBrainzWriters(title, ascapWork);
    if (musicbrainz.writers.length) sourceResults.push(musicbrainz);
  }
  if (!sourceResults.length) {
    return { lookup_status: "not_found", sources: [], writers: [], notes: "No source returned a usable writer set." };
  }
  const best = selectReferenceResult(sourceResults, ascapWork, candidates);
  return best.writers.length
    ? { lookup_status: "found", sources: best.sources, writers: best.writers, notes: null }
    : { lookup_status: "not_found", sources: [], writers: [], notes: "No public writer names were found." };
}

async function lookupMusicBrainzWriters(title, ascapWork) {
  const artistTerm = ascapWork.performer ? ` AND artist:${quoteSearchTerm(ascapWork.performer)}` : "";
  const writerTerms = normalizedPartyNames(ascapWork.writers).map((name) => ` AND credit:${quoteSearchTerm(name)}`).join("");
  const queries = [
    `recording:${quoteSearchTerm(title)}${artistTerm}`,
    `recording:${quoteSearchTerm(title)}${writerTerms}`,
    `work:${quoteSearchTerm(title)}`,
  ];
  for (const query of queries) {
    try {
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
      const data = await fetchJson(url, { source: "musicbrainz" });
      const recordings = data?.recordings || [];
      for (const recording of recordings) {
        if (!looksLikeTitleMatch(title, recording.title || "")) continue;
        const writers = await musicBrainzRecordingWriters(recording.id);
        if (writers.length) return { source: "MusicBrainz", writers: uniqueNames(writers) };
      }
    } catch {
      // Public reference lookup is advisory; continue to the next source.
    }
  }
  return { source: "MusicBrainz", writers: [] };
}

async function musicBrainzRecordingWriters(recordingId) {
  try {
    const data = await fetchJson(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(recordingId)}?inc=work-rels&fmt=json`, { source: "musicbrainz" });
    const workIds = (data?.relations || [])
      .filter((relation) => relation.type === "performance" && relation.work?.id)
      .map((relation) => relation.work.id);
    const writers = [];
    for (const workId of workIds.slice(0, 3)) {
      const work = await fetchJson(`https://musicbrainz.org/ws/2/work/${encodeURIComponent(workId)}?inc=artist-rels&fmt=json`, { source: "musicbrainz" });
      (work?.relations || []).forEach((relation) => {
        if (["writer", "composer", "lyricist"].includes(relation.type) && relation.artist?.name) writers.push(relation.artist.name);
      });
    }
    return uniqueNames(writers);
  } catch {
    return [];
  }
}

async function lookupWikidataWriters(title, ascapWork) {
  const writerHints = normalizedPartyNames(ascapWork.writers).map((name) => `"${name}"`).join(" ");
  const search = `${title} song ${ascapWork.performer || writerHints}`.trim();
  try {
    const searchData = await fetchJson(`https://www.wikidata.org/w/rest.php/wikibase/v0/search/entities?search=${encodeURIComponent(search)}&language=en&limit=5`, { source: "wikimedia" });
    for (const item of searchData?.search || []) {
      const entity = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(item.id)}.json`, { source: "wikimedia" });
      const claims = entity?.entities?.[item.id]?.claims || {};
      const ids = [...(claims.P86 || []), ...(claims.P676 || []), ...(claims.P162 || [])]
        .map((claim) => claim.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
      const names = [];
      for (const id of ids.slice(0, 12)) {
        const nameData = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(id)}.json`, { source: "wikimedia" });
        const label = nameData?.entities?.[id]?.labels?.en?.value;
        if (label) names.push(label);
      }
      if (names.length) return { source: "Wikidata", writers: uniqueNames(names) };
    }
  } catch {
    // Advisory lookup only.
  }
  return { source: "Wikidata", writers: [] };
}

async function lookupWikipediaWriters(title, ascapWork) {
  const terms = uniqueStrings([
    `${title} song ${ascapWork.performer || ""}`,
    `${title} song ${normalizedPartyNames(ascapWork.writers)[0] || ""}`,
    `${title} song`,
  ]);
  for (const term of terms) {
    try {
      const search = await fetchJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(term)}&limit=5`, { source: "wikimedia" });
      for (const page of search?.pages || []) {
        if (!looksLikeTitleMatch(title, page.title || "")) continue;
        const wikitext = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*&titles=${encodeURIComponent(page.title)}`, { source: "wikimedia" });
        const pages = Object.values(wikitext?.query?.pages || {});
        const content = pages[0]?.revisions?.[0]?.slots?.main?.["*"] || "";
        const writers = splitWikipediaNames(infoboxField(content, "writer") || infoboxField(content, "composer"));
        if (writers.length) return { source: "Wikipedia", writers: uniqueNames(writers) };
      }
    } catch {
      // Advisory lookup only.
    }
  }
  return { source: "Wikipedia", writers: [] };
}

function selectReferenceResult(sourceResults, ascapWork, candidates) {
  const candidateWriters = candidates.flatMap((candidate) => displayWriterNames(candidate));
  const enteredWriters = normalizedPartyNames(ascapWork.writers);
  const scored = sourceResults.map((result) => {
    const writers = uniqueNames(result.writers);
    const enteredScore = enteredWriters.length ? average(enteredWriters.map((writer) => bestLocalNameSimilarity(writer, writers.map(normalizeName)))) : 0.5;
    const candidateScore = candidateWriters.length ? average(writers.map((writer) => bestLocalNameSimilarity(normalizeName(writer), candidateWriters.map(normalizeName)))) : 0;
    return { result, writers, score: enteredScore * 0.55 + candidateScore * 0.45 };
  });
  const best = scored.sort((left, right) => right.score - left.score)[0];
  return best && best.score >= 0.45
    ? { sources: [best.result.source], writers: best.writers }
    : { sources: [], writers: [] };
}

function capturedCandidateWriterReference(ascapWork, candidates) {
  const enteredWriters = normalizedPartyNames(ascapWork.writers);
  const sameTitle = candidates.filter((candidate) => normalizeTitle(candidate.title) === normalizeTitle(ascapWork.title));
  const groups = sameTitle
    .map((candidate) => displayWriterNames(candidate))
    .filter((writers) => writers.length)
    .filter((writers) => !enteredWriters.length || enteredWriters.some((entered) => bestLocalNameSimilarity(entered, writers.map(normalizeName)) >= 0.88));
  if (!groups.length) return null;
  const best = groups.sort((left, right) => right.length - left.length)[0];
  return {
    lookup_status: "found",
    sources: ["Captured ASCAP public repertoire"],
    writers: uniqueNames(best),
    notes: "External metadata did not return a usable writer set; captured ASCAP writer context was used.",
  };
}

function referenceMatchesEnteredWriterContext(ascapWork, referenceWriters) {
  const enteredWriters = normalizedPartyNames(ascapWork.writers);
  if (!enteredWriters.length || !referenceWriters.length) return true;
  return enteredWriters.some((writer) => bestLocalNameSimilarity(writer, referenceWriters.map(normalizeName)) >= 0.88);
}

function candidateReferenceMatches(candidate, writerReference) {
  const candidateWriters = displayWriterNames(candidate);
  const normalizedCandidates = candidateWriters.map(normalizeName);
  const referenceWriters = uniqueNames(writerReference.writers);
  const matched = [];
  const missing = [];
  const extra = [];
  const matchedCandidateIndexes = new Set();
  referenceWriters.forEach((writer) => {
    const match = bestNameMatch(normalizeName(writer), normalizedCandidates, matchedCandidateIndexes);
    if (match.score >= 0.88) {
      matched.push(writer);
      matchedCandidateIndexes.add(match.index);
    } else {
      missing.push(writer);
    }
  });
  candidateWriters.forEach((writer, index) => {
    if (matchedCandidateIndexes.has(index)) return;
    if (bestLocalNameSimilarity(normalizeName(writer), referenceWriters.map(normalizeName)) < 0.88) extra.push(writer);
  });
  return { matched, missing, extra };
}

function buildComparisonDetails(ascapWork, candidate) {
  return {
    ascap_title: normalizeTitle(ascapWork.title),
    candidate_title: normalizeTitle(candidate.title),
    ascap_iswc: normalizeIswc(ascapWork.iswc) || null,
    candidate_iswc: normalizeIswc(candidate.iswc) || null,
    ascap_writers: normalizedPartyNames(ascapWork.writers),
    candidate_writers: normalizedPartyNames(candidate.writers),
    ascap_publishers: normalizedPartyNames(ascapWork.publishers, true),
    candidate_publishers: normalizedPartyNames(candidate.publishers, true),
  };
}

function reviewDecisionFor(topResult) {
  if (!topResult) return { label: "Needs Manual Review", severity: "warning", confidence_score: 0, rationale: ["No candidate records were available for analysis."] };
  const highCount = topResult.discrepancies.filter((item) => item.severity === "high").length;
  const hasIswcConflict = topResult.discrepancies.some((item) => item.type === "iswc_mismatch");
  const rationale = [
    topResult.comparison_details.ascap_title === topResult.comparison_details.candidate_title
      ? "Title normalizes to the same work title."
      : "Title needs review.",
  ];
  if (topResult.matching_evidence.length) rationale.push(`Positive evidence was found for: ${topResult.matching_evidence.slice(0, 4).map((item) => item.field).join(", ")}.`);
  if (highCount) rationale.push(`${highCount} high-severity discrepancy item(s) require review.`);
  if (topResult.confidence_score >= 85 && highCount === 0 && !hasIswcConflict) {
    return { label: "Likely Same Work", severity: "success", confidence_score: topResult.confidence_score, rationale };
  }
  if (topResult.confidence_score < 50 || hasIswcConflict || highCount >= 2) {
    return { label: "Likely Different Work", severity: "danger", confidence_score: topResult.confidence_score, rationale };
  }
  return { label: "Needs Manual Review", severity: "warning", confidence_score: topResult.confidence_score, rationale };
}

function generateReportText(ascapWork, results, reviewDecision, reference) {
  const top = results[0];
  const lines = [
    "ASCAP Possible Match Review",
    "===========================",
    "",
    "ASCAP Work Searched",
    "-------------------",
    `Title: ${ascapWork.title || "Not provided"}`,
    `ASCAP Song Code: ${ascapWork.song_code || "Not provided"}`,
    `ISWC: ${ascapWork.iswc || "Not shown"}`,
    `Writers: ${partyNames(ascapWork.writers)}`,
    `Publishers: ${partyNames(ascapWork.publishers)}`,
    "",
    "Review Decision",
    "---------------",
    `Decision: ${reviewDecision.label}`,
    `Decision Score: ${reviewDecision.confidence_score}%`,
    "Why:",
    ...prefixLines(reviewDecision.rationale),
  ];
  if (reference) {
    lines.push("", "External Writer Reference", "-------------------------", `Status: ${reference.lookup_status}`, `Sources: ${reference.sources?.join(", ") || "None found"}`, `Writers: ${reference.writers?.join(", ") || "None found"}`, "Note: Public reference evidence is advisory and should be reviewed against ASCAP.");
  }
  if (top) {
    lines.push("", "Top Candidate", "-------------", `Rank: ${top.rank}`, `Title: ${top.candidate.title}`, `ASCAP Work ID: ${top.candidate.public_work_id || "Not provided"}`, `Match Score: ${top.confidence_score}%`, `Confidence Label: ${top.confidence_label}`, "", "Matching Evidence", "-----------------", ...prefixLines(top.matching_evidence.map((item) => item.description)), "", "Discrepancies", "-------------", ...prefixLines(top.discrepancies.map((item) => item.description)));
  }
  lines.push("", "Disclaimer", "----------", DISCLAIMER);
  return lines.join("\n").trim();
}

function confidenceLabel(score) {
  if (score >= 85) return "Strong Match";
  if (score >= 65) return "Possible Match";
  if (score >= 40) return "Weak Match";
  return "Not a Match";
}

function normalizeTextBasic(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTitle(value) {
  const parts = normalizeTextBasic(value).split(" ").filter(Boolean);
  if (parts.length > 1 && ["the", "a", "an"].includes(parts[parts.length - 1])) return [parts[parts.length - 1], ...parts.slice(0, -1)].join(" ");
  return parts.join(" ");
}

function normalizeName(value) {
  const noiseTokens = new Set(["ascap", "bmi", "gmr", "sesac", "pro", "ipi", "cae"]);
  return normalizeTextBasic(value)
    .split(" ")
    .filter((token) => token && !noiseTokens.has(token) && !/^\d{6,}$/.test(token))
    .join(" ");
}

function normalizePublisherName(value) {
  const suffixes = new Set(["co", "company", "corp", "corporation", "inc", "llc", "ltd", "limited", "music", "publishing", "pub", "pubs"]);
  return normalizeTextBasic(value).split(" ").filter((word) => !suffixes.has(word)).join(" ");
}

function normalizeIdentifier(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function normalizeIswc(value) {
  return normalizeIdentifier(value);
}

function normalizedPartyNames(parties = [], publisher = false) {
  const normalizer = publisher ? normalizePublisherName : normalizeName;
  return parties.map((party) => normalizer(party.name)).filter(Boolean);
}

function bestLocalNameSimilarity(name, candidates) {
  return candidates.length ? Math.max(...candidates.map((candidate) => localNameSimilarity(name, candidate))) : 0;
}

function localNameSimilarity(left, right) {
  const compactLeft = normalizeCompact(left);
  const compactRight = normalizeCompact(right);
  if (!compactLeft || !compactRight) return 0;
  if (compactLeft === compactRight) return 1;
  if (Math.min(compactLeft.length, compactRight.length) >= 4 && (compactLeft.includes(compactRight) || compactRight.includes(compactLeft))) return 1;
  const leftTokens = tokenSet(normalizeName(left));
  const rightTokens = tokenSet(normalizeName(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  if (isSubset(leftTokens, rightTokens) || isSubset(rightTokens, leftTokens)) return 1;
  const sharedDistinctive = [...leftTokens].filter((token) => token.length >= 3 && rightTokens.has(token)).length;
  if (sharedDistinctive >= 2) return 1;
  if (hasDistinctiveSurnameOverlap(leftTokens, rightTokens)) return 0.95;
  return tokenSortRatio(normalizeName(left), normalizeName(right));
}

function tokenSortRatio(left, right) {
  const leftTokens = normalizeName(left).split(" ").filter(Boolean).sort();
  const rightTokens = normalizeName(right).split(" ").filter(Boolean).sort();
  if (!leftTokens.length || !rightTokens.length) return 0;
  if (leftTokens.join(" ") === rightTokens.join(" ")) return 1;
  const shared = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const tokenScore = shared / Math.max(leftTokens.length, rightTokens.length);
  const compactLeft = leftTokens.join("");
  const compactRight = rightTokens.join("");
  const charScore = compactSimilarity(compactLeft, compactRight);
  return Math.max(tokenScore, charScore);
}

function compactSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLength = Math.max(left.length, right.length);
  const distance = levenshteinDistance(left, right);
  return Math.max(0, 1 - distance / maxLength);
}

function levenshteinDistance(left, right) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = costs[0];
    costs[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = costs[j];
      costs[j] = left[i - 1] === right[j - 1] ? previous : Math.min(previous, costs[j], costs[j - 1]) + 1;
      previous = current;
    }
  }
  return costs[right.length];
}

function tokenSet(value) {
  return new Set(normalizeName(value).split(/\s+/).filter((token) => token.length > 1));
}

function hasDistinctiveSurnameOverlap(leftTokens, rightTokens) {
  return [...leftTokens].some((token) => token.length >= 4 && rightTokens.has(token));
}

function lowMatchRatio(sourceNames, targetNames) {
  return sourceNames.filter((name) => bestLocalNameSimilarity(name, targetNames) < 0.88).length / sourceNames.length;
}

function displayWriterNames(candidate) {
  return (candidate.writers || [])
    .map((party) => String(party.name || "").replace(/\b\d{6,}\b/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function roundScore(value) {
  return Math.round(value * 100) / 100;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function uniqueNames(names) {
  const output = [];
  names.map((name) => String(name || "").replace(/\s+/g, " ").trim()).filter(Boolean).forEach((name) => {
    if (!output.some((existing) => localNameSimilarity(existing, name) >= 0.88)) output.push(name);
  });
  return output;
}

function quoteSearchTerm(value) {
  return `"${String(value || "").replace(/"/g, "")}"`;
}

function looksLikeTitleMatch(searchTitle, foundTitle) {
  return tokenSortRatio(normalizeTitle(searchTitle), normalizeTitle(foundTitle)) >= 0.88;
}

function infoboxField(wikitext, field) {
  const match = String(wikitext || "").match(new RegExp(`\\|\\s*${field}\\s*=\\s*([^\\n]+)`, "i"));
  return match ? match[1] : "";
}

function splitWikipediaNames(value) {
  return String(value || "")
    .replace(/\{\{[^|}]+\|([^}]+)\}\}/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .split(/,|;|\band\b|<br\s*\/?>/i)
    .map((name) => name.replace(/['"]/g, "").trim())
    .filter((name) => name && name.length < 80 && !/^\d+$/.test(name));
}

async function fetchJson(url, { source = "generic" } = {}) {
  const cached = referenceFetchCache.get(url);
  const now = Date.now();
  if (cached && now - cached.timestamp < REFERENCE_CACHE_TTL_MS) {
    return cached.data;
  }

  await (referenceRequestLimiters[source] || referenceRequestLimiters.generic)();

  const headers = {
    Accept: "application/json",
  };
  if (source === "wikimedia") {
    headers["Api-User-Agent"] = WIKIMEDIA_API_USER_AGENT;
  }

  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) throw new Error(`Reference request failed with status ${response.status}`);
  const data = await response.json();
  referenceFetchCache.set(url, { data, timestamp: Date.now() });
  return data;
}

function partyNames(parties = []) {
  return parties.length ? parties.map((party) => party.name).join(", ") : "Not provided";
}

function prefixLines(items) {
  return items?.length ? items.map((item) => `- ${item}`) : ["- None returned"];
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("error", isError);
}

function setBusy(button, isBusy, label) {
  button.disabled = isBusy;
  button.textContent = label;
}

function optional(value) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function buildAscapSearchPlan(work) {
  const title = (work.title || "").trim();
  const songCode = (work.song_code || "").trim();
  const iswc = (work.iswc || "").trim();
  const performer = (work.performer || "").trim();
  const writer = firstWriterSearchTerm(work.writers);
  const publisher = firstPublisherSearchTerm(work.publishers);

  if (iswc) {
    return [{ type: "ISWC", term: iswc }];
  }
  if (songCode) {
    return [{ type: "Work ID", term: songCode }];
  }

  if (title) {
    if (performer) {
      return [{ type: "Title", term: title, secondaryType: "Performer", secondaryTerm: performer }];
    }
    if (writer) {
      return [{ type: "Title", term: title, secondaryType: "Writer", secondaryTerm: writer }];
    }
    if (publisher) {
      return [{ type: "Title", term: title, secondaryType: "Publisher", secondaryTerm: publisher }];
    }
    return [{ type: "Title", term: title }];
  }

  if (performer) {
    return [{ type: "Performer", term: performer }];
  }
  if (writer) {
    return [{ type: "Writer", term: writer }];
  }
  if (publisher) {
    return [{ type: "Publisher", term: publisher }];
  }

  return [];
}

function buildAscapSearchUrl(search) {
  const route = ascapRouteSegment(search.type);
  const encodedTerm = encodeURIComponent(search.term.trim());
  let url = `https://www.ascap.com/repertory#/ace/search/${route}/${encodedTerm}`;
  if (search.secondaryType && search.secondaryTerm) {
    url += `/${ascapRouteSegment(search.secondaryType)}/${encodeURIComponent(search.secondaryTerm.trim())}`;
  }
  return `${url}?at=false&searchFilter=SVW&page=1`;
}

function ascapRouteSegment(type) {
  const routes = {
    Title: "title",
    Performer: "performer",
    Writer: "writer",
    Publisher: "publisher",
    "Work ID": "workId",
    ISWC: "iswc",
  };
  return routes[type] || "title";
}

function firstWriterSearchTerm(value) {
  return firstPartySearchTerm(value);
}

function firstPublisherSearchTerm(value) {
  return firstPartySearchTerm(value);
}

function firstPartySearchTerm(value) {
  const firstLine = (value || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return "";
  }

  return firstLine.replace(/\s+\|\s*\d+(?:\.\d+)?\s*%?\s*$/, "").trim();
}

function formatPartySummary(parties = []) {
  if (!parties.length) {
    return "None parsed";
  }
  const visibleParties = parties.slice(0, 3).map((party) => party.name);
  const remainingCount = parties.length - visibleParties.length;
  const suffix = remainingCount > 0 ? ` + ${remainingCount} more` : "";
  return `${visibleParties.join(", ")}${suffix}`;
}

function mergeCandidates(existingCandidates, newCandidates) {
  const keyed = new Map();
  let added = 0;
  let duplicates = 0;
  existingCandidates.forEach((candidate) => {
    keyed.set(candidateKey(candidate), candidate);
  });
  newCandidates.forEach((candidate) => {
    const key = candidateKey(candidate);
    if (keyed.has(key)) {
      duplicates += 1;
    } else {
      added += 1;
    }
    keyed.set(key, candidate);
  });
  return {
    candidates: Array.from(keyed.values()),
    added,
    duplicates,
  };
}

function candidateKey(candidate) {
  const source = (candidate.source || "").toLowerCase();
  if (candidate.public_work_id) {
    return `${source}|work-id|${String(candidate.public_work_id).toLowerCase()}`;
  }
  if (candidate.iswc) {
    return `${source}|iswc|${String(candidate.iswc).replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`;
  }
  const writerKey = (candidate.writers || [])
    .map((writer) => writer.name || "")
    .join(",")
    .toLowerCase();
  return `${source}|title-writers|${String(candidate.title || "").toLowerCase()}|${writerKey}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fillPublicRepertoireSearch({ targetSource, title, songCode, iswc, performer, writer, publisher }) {
  const source = targetSource.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  const isAscap = host.includes("ascap.com");

  if (source === "ascap" && !isAscap) {
    return {
      ok: false,
      message: "Open an ASCAP repertory tab before using Fill ASCAP search.",
    };
  }
  return fillAscapPage(title, songCode, iswc, performer, writer, publisher);

  function fillAscapPage(workTitle, workSongCode, workIswc, workPerformer, workWriter, workPublisher) {
    const textInputs = visibleTextInputs();
    const primary = chooseAscapPrimary(workTitle, workSongCode, workIswc, workPerformer, workWriter, workPublisher);
    const titleInput = findInputByNearbyText(textInputs, ["title"]) || textInputs[0];

    if (!primary.term || !titleInput) {
      return {
        ok: false,
        message: "Could not find an ASCAP search input. Open the ASCAP repertory search page first.",
      };
    }

    setNativeValue(titleInput, primary.term);
    setSelectNearInput(titleInput, primary.type);

    const secondary = chooseAscapSecondary(primary.type, workPerformer, workWriter, workPublisher);
    const secondaryInput =
      primary.type === "Title"
        ? findInputByNearbyText(textInputs, [
            secondary.type.toLowerCase(),
            "performer",
            "writer",
            "publisher",
            "artist",
          ]) || textInputs.find((input) => input !== titleInput)
        : null;

    if (primary.type === "Title" && secondary.term && secondaryInput) {
      setNativeValue(secondaryInput, secondary.term);
      setSelectNearInput(secondaryInput, secondary.type);
    }

    return {
      ok: true,
      message: primary.type === "Title" && secondary.term
        ? `Filled ASCAP title and ${secondary.type.toLowerCase()} fields. Review them, then click Search.`
        : `Filled ASCAP ${primary.type.toLowerCase()} search. Review it, then click Search.`,
    };
  }

  function chooseAscapPrimary(workTitle, workSongCode, workIswc, workPerformer, workWriter, workPublisher) {
    if ((workIswc || "").trim()) {
      return { type: "ISWC", term: workIswc.trim() };
    }
    if ((workSongCode || "").trim()) {
      return { type: "Work ID", term: workSongCode.trim() };
    }
    if ((workTitle || "").trim()) {
      return { type: "Title", term: workTitle.trim() };
    }
    if ((workPerformer || "").trim()) {
      return { type: "Performer", term: workPerformer.trim() };
    }
    if ((workWriter || "").trim()) {
      return { type: "Writer", term: workWriter.trim() };
    }
    if ((workPublisher || "").trim()) {
      return { type: "Publisher", term: workPublisher.trim() };
    }
    return { type: "Title", term: "" };
  }

  function chooseAscapSecondary(primaryType, workPerformer, workWriter, workPublisher) {
    if (primaryType !== "Title") {
      return { type: "Performer", term: "" };
    }
    if ((workPerformer || "").trim()) {
      return { type: "Performer", term: workPerformer.trim() };
    }
    if ((workWriter || "").trim()) {
      return { type: "Writer", term: workWriter.trim() };
    }
    if ((workPublisher || "").trim()) {
      return { type: "Publisher", term: workPublisher.trim() };
    }
    return { type: "Performer", term: "" };
  }

  function visibleTextInputs() {
    return Array.from(document.querySelectorAll("input, textarea")).filter((element) => {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      return ["text", "search", ""].includes(type) && isVisible(element);
    });
  }

  function findInputByNearbyText(inputs, terms) {
    return inputs.find((input) => {
      const context = nearbyText(input).toLowerCase();
      return terms.some((term) => context.includes(term));
    });
  }

  function nearbyText(element) {
    const labels = [];
    if (element.id) {
      const label = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
      if (label) labels.push(label.innerText || "");
    }
    let current = element;
    for (let index = 0; index < 4 && current; index += 1) {
      labels.push(current.innerText || "");
      labels.push(current.getAttribute?.("aria-label") || "");
      labels.push(current.getAttribute?.("placeholder") || "");
      current = current.parentElement;
    }
    return labels.join(" ");
  }

  function setNativeValue(element, value) {
    element.focus();
    const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setSelectNearInput(input, wantedText) {
    const nearbySelect = visibleSelects().find((select) => sharesAncestor(select, input));
    if (nearbySelect) {
      setSelectValue(nearbySelect, wantedText);
    }
  }

  function visibleSelects() {
    return Array.from(document.querySelectorAll("select")).filter(isVisible);
  }

  function setSelectValue(select, wantedText) {
    const option = Array.from(select.options).find((item) =>
      item.textContent.toLowerCase().includes(wantedText.toLowerCase()),
    );
    if (!option) {
      return;
    }
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function sharesAncestor(left, right) {
    let current = left.parentElement;
    for (let index = 0; index < 4 && current; index += 1) {
      if (current.contains(right)) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function cssEscape(value) {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }
    return value.replace(/"/g, '\\"');
  }
}

async function extractVisibleRepertoireResults() {
  let results = [];
  let expandClickCount = 0;

  await waitForPageSettled(700);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    expandClickCount += await expandVisibleAscapResults();
    await waitForPageSettled(attempt === 1 ? 1200 : 1600);
    results = findAscapResultBlocks();
    if (results.length) {
      break;
    }
  }

  if (results.length) {
    return {
      url: window.location.href,
      title: document.title,
      results,
      diagnostics: {
        found: results.length,
        expand_clicks: expandClickCount,
      },
      message: `Captured ${results.length} ASCAP result(s).`,
    };
  }

  return {
    url: window.location.href,
    title: document.title,
    results: [],
    diagnostics: {
      found: 0,
      expand_clicks: expandClickCount,
      has_identifiers: hasAny(document.body?.innerText || "", ["ISWC", "Work ID"]),
      has_result_words: hasAny(document.body?.innerText || "", ["Writers", "Publishers", "Performers", "Results"]),
    },
    message: "No expanded ASCAP result blocks were found. Wait for ASCAP results to finish expanding, then try again.",
  };

  async function expandVisibleAscapResults() {
    const controls = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(isVisible)
      .filter((element) => {
        const text = normalizeText(element.innerText || element.getAttribute("aria-label") || "");
        return /^(\+ )?expand( all)?$/i.test(text) || text.toLowerCase().includes("expand");
      });
    let clicked = 0;

    for (const control of controls) {
      try {
        control.scrollIntoView({ block: "center", inline: "nearest" });
        await waitForPageSettled(120);
        dispatchUserLikeClick(control);
        clicked += 1;
        await waitForPageSettled(260);
      } catch {
        // Best effort only. ASCAP can change markup; capture should still continue.
      }
    }
    return clicked;
  }

  function dispatchUserLikeClick(element) {
    const options = { bubbles: true, cancelable: true, view: window };
    element.dispatchEvent(new MouseEvent("mouseover", options));
    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("mouseup", options));
    element.dispatchEvent(new MouseEvent("click", options));
    element.click();
  }

  function findAscapResultBlocks() {
    const pageTextResults = dedupeResultTexts(splitAscapResultsFromPageText(document.body?.innerText || ""));
    const elements = Array.from(document.querySelectorAll("article, section, [class*='result'], [class*='work'], [class*='card'], div"));
    const blocks = elements
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: normalizeText(element.innerText || ""),
          top: rect.top,
          left: rect.left,
          area: rect.width * rect.height,
        };
      })
      .filter(isLikelyWorkResult)
      .filter((block) => block.area < window.innerWidth * window.innerHeight * 1.5)
      .sort((left, right) => left.top - right.top || left.left - right.left || left.area - right.area);

    let selectedBlocks = [];
    for (const block of blocks) {
      if (selectedBlocks.some((selected) => selected.text.includes(block.text))) {
        continue;
      }
      if (selectedBlocks.some((selected) => block.text.includes(selected.text))) {
        continue;
      }
      selectedBlocks.push(block);
    }

    const domResults = dedupeResultTexts(selectedBlocks.map((block) => block.text));
    const resultTexts = pageTextResults.length >= domResults.length ? pageTextResults : mergeResultTexts(pageTextResults, domResults);

    return resultTexts.map((text, index) => ({
      text,
      index,
    }));
  }

  function normalizeText(value) {
    return value
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function isLikelyWorkResult(block) {
    const text = block.text;
    const upper = text.toUpperCase();
    if (text.length < 40 || text.length > 6500) {
      return false;
    }
    if (!hasAny(text, ["ISWC", "WORK ID"])) {
      return false;
    }
    if (!hasAny(text, ["WRITERS", "PUBLISHERS", "PERFORMERS"])) {
      return false;
    }
    if (upper.includes("SEARCH FOR:") || upper.includes("INCLUDE ALTERNATE TITLES")) {
      return false;
    }
    if (upper.includes("RESULTS FOUND") && upper.includes("SEARCH")) {
      return false;
    }
    return true;
  }

  function splitAscapResultsFromPageText(value) {
    const lines = normalizeText(value).split("\n");
    const resultStarts = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      const nearby = lines.slice(index, index + 8).join("\n");
      if (isLikelyTitleLine(current) && hasAscapIdentifiers(nearby)) {
        resultStarts.add(index);
        continue;
      }

      if (hasAscapIdentifiers(current) || /\b(?:ISWC|Work ID)\s*:?/i.test(current)) {
        const titleIndex = findPreviousTitleLine(lines, index);
        if (titleIndex !== -1) {
          resultStarts.add(titleIndex);
        }
      }
    }

    const starts = Array.from(resultStarts).sort((left, right) => left - right);
    const chunks = [];
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index];
      const end = starts[index + 1] || findResultEnd(lines, start);
      const chunk = trimResultChunk(lines.slice(start, end)).join("\n");
      if (isLikelyWorkResult({ text: chunk })) {
        chunks.push(chunk);
      }
    }
    return chunks;
  }

  function hasAscapIdentifiers(text) {
    return /\bISWC\s*:?\s*T[-\s]?\d{3}/i.test(text) && /\bWork ID\s*:?\s*\d{5,10}/i.test(text);
  }

  function findPreviousTitleLine(lines, index) {
    for (let offset = 0; offset <= 5; offset += 1) {
      const candidateIndex = index - offset;
      if (candidateIndex < 0) {
        break;
      }
      if (isLikelyTitleLine(lines[candidateIndex])) {
        return candidateIndex;
      }
    }
    return -1;
  }

  function findResultEnd(lines, start) {
    for (let index = start + 1; index < lines.length; index += 1) {
      if (isLikelyTitleLine(lines[index]) && hasAscapIdentifiers(lines.slice(index, index + 8).join("\n"))) {
        return index;
      }
    }
    return lines.length;
  }

  function trimResultChunk(lines) {
    const stopIndex = lines.findIndex((line, index) => {
      if (index < 6) {
        return false;
      }
      return /^(share|print|collapse)$/i.test(line) || /^ask ascap$/i.test(line);
    });
    return stopIndex === -1 ? lines : lines.slice(0, stopIndex);
  }

  function isLikelyTitleLine(line) {
    if (!line || line.length > 80) {
      return false;
    }
    const upper = line.toUpperCase();
    if (upper !== line) {
      return false;
    }
    return !hasAny(line, [
      "ASCAP",
      "BMI",
      "ISWC",
      "WORK ID",
      "WRITERS",
      "PUBLISHERS",
      "PERFORMERS",
      "TOTAL CURRENT",
      "SEARCH",
      "REPERTORY",
      "SONGVIEW",
      "CONTACT INFO",
      "PRO",
      "IPI",
    ]);
  }

  function dedupeResultTexts(texts) {
    const seen = new Set();
    const deduped = [];
    for (const text of texts) {
      const workId = matchValue(text, /\bWork ID\s*:?\s*(\d{5,10})\b/i);
      const iswc = matchValue(text, /\bISWC\s*:?\s*(T[-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[-\s]?\d)\b/i);
      const key = workId
        ? `work-id|${workId}`
        : iswc
          ? `iswc|${iswc.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`
          : `title|${text.split("\n")[0].toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(text);
      }
    }
    return deduped;
  }

  function mergeResultTexts(primaryTexts, fallbackTexts) {
    return dedupeResultTexts([...primaryTexts, ...fallbackTexts]);
  }

  function matchValue(text, pattern) {
    return text.match(pattern)?.[1] || "";
  }

  function hasAny(text, terms) {
    const upper = text.toUpperCase();
    return terms.some((term) => upper.includes(term.toUpperCase()));
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function waitForPageSettled(delay = 650) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
