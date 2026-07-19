const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "ascapTriageExtensionState";

const elements = {
  saveWorkButton: document.querySelector("#saveWorkButton"),
  titleInput: document.querySelector("#titleInput"),
  songCodeInput: document.querySelector("#songCodeInput"),
  iswcInput: document.querySelector("#iswcInput"),
  performerInput: document.querySelector("#performerInput"),
  writersInput: document.querySelector("#writersInput"),
  publishersInput: document.querySelector("#publishersInput"),
  openAscapButton: document.querySelector("#openAscapButton"),
  fillAscapButton: document.querySelector("#fillAscapButton"),
  searchPlan: document.querySelector("#searchPlan"),
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
  backendStatus: document.querySelector("#backendStatus"),
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
};

let reportOpen = false;

init();

async function init() {
  await loadState();
  bindEvents();
  render();
  checkBackendStatus();
}

function bindEvents() {
  elements.saveWorkButton.addEventListener("click", saveWorkFromInputs);
  elements.openAscapButton.addEventListener("click", openAscapSearch);
  elements.fillAscapButton.addEventListener("click", fillAscapSearch);
  elements.captureButton.addEventListener("click", captureCurrentTab);
  elements.clearCandidatesButton.addEventListener("click", clearCandidates);
  elements.analyzeButton.addEventListener("click", analyzeCandidates);
  elements.toggleReportButton.addEventListener("click", toggleReport);
  elements.copyReportButton.addEventListener("click", copyReport);
  elements.candidateList.addEventListener("click", handleCandidateListClick);
  elements.resultsList.addEventListener("click", handleResultsListClick);

  [
    elements.titleInput,
    elements.songCodeInput,
    elements.iswcInput,
    elements.performerInput,
    elements.writersInput,
    elements.publishersInput,
  ].forEach((input) => {
    input.addEventListener("change", saveWorkFromInputs);
  });
}

async function loadState() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  state = { ...state, ...(stored[STORAGE_KEY] || {}) };
}

async function saveState() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function saveWorkFromInputs() {
  state.work = {
    title: elements.titleInput.value,
    song_code: elements.songCodeInput.value,
    iswc: elements.iswcInput.value,
    performer: elements.performerInput.value,
    writers: elements.writersInput.value,
    publishers: elements.publishersInput.value,
  };
  saveState();
  render();
  setStatus("Work metadata saved.");
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
        parsed = await apiFetch("/api/parse-candidate", {
          method: "POST",
          body: JSON.stringify({
            source: "ASCAP Repertory",
            raw_text: capturedResult.text,
          }),
        });
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
    const analysis = await apiFetch("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        ascap_work: buildAscapWork(),
        candidates: state.candidates,
      }),
    });
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

async function checkBackendStatus() {
  setBackendStatus("checking", "Backend checking");
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    const data = await response.json();
    if (data?.status !== "ok") {
      throw new Error("unexpected health response");
    }
    setBackendStatus("connected", "Backend connected");
  } catch {
    setBackendStatus("error", "Backend not running");
  }
}

function setBackendStatus(status, label) {
  elements.backendStatus.textContent = label;
  elements.backendStatus.classList.toggle("backend-status--checking", status === "checking");
  elements.backendStatus.classList.toggle("backend-status--connected", status === "connected");
  elements.backendStatus.classList.toggle("backend-status--error", status === "error");
}

function buildAscapWork() {
  return {
    title: state.work.title.trim(),
    song_code: optional(state.work.song_code),
    iswc: optional(state.work.iswc),
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

  elements.candidateCount.textContent =
    state.candidates.length === 0
      ? "No candidates captured."
      : `Ready: ${state.candidates.length} ASCAP candidate(s) captured.`;
  elements.analyzeButton.disabled = state.candidates.length === 0;
  renderSearchPlan();
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
            <span class="score">${escapeHtml(result.confidence_score.toFixed(0))}%<br>${escapeHtml(result.confidence_label)}</span>
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
    ${
      writers.length
        ? `<div class="reference-writers">${writers.map((writer) => `<span>${escapeHtml(writer)}</span>`).join("")}</div>`
        : `<div class="muted-line">No public writer names were found.</div>`
    }
    <div class="muted-line">Advisory public metadata only. Use it to support review, not replace ASCAP verification.</div>
  `;
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

function renderSearchPlan() {
  const plan = buildAscapSearchPlan(state.work);
  if (!plan.length) {
    elements.searchPlan.innerHTML = `<div class="muted-line">Enter any ASCAP search field to prepare a search.</div>`;
    return;
  }

  elements.searchPlan.innerHTML = plan
    .map(
      (item) => `
        <div class="search-chip">
          <span>${escapeHtml(item.type)}</span>
          <strong>${escapeHtml(item.term)}</strong>
          ${item.secondaryType ? `<em>${escapeHtml(`${item.secondaryType}: ${item.secondaryTerm}`)}</em>` : ""}
        </div>
      `,
    )
    .join("");
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
      <div class="review-title">Why this rank</div>
      <div class="match-line">${escapeHtml(summary)}</div>
      ${issues ? `<div class="warning-line">${escapeHtml(issues)}</div>` : ""}
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

  parts.push(titleMatched ? "Title matched" : "Title is similar but not exact");
  if (searchedWriterCount) {
    parts.push(`${matchedWriters.length} of ${searchedWriterCount} searched writer(s) matched`);
  } else {
    parts.push("No searched writers were provided");
  }
  if (hasProvidedIdentifierEvidence(result)) {
    parts.push("provided identifier matched");
  }
  return `${parts.join("; ")}.`;
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
    issues.push(`Missing searched writer(s): ${missingWriters.join(", ")}`);
  }
  if (extraWriters.length) {
    issues.push(`Extra candidate writer(s): ${extraWriters.join(", ")}`);
  }
  if (missingReferenceWriters.length) {
    issues.push(`Missing public reference writer(s): ${missingReferenceWriters.join(", ")}`);
  }
  if (extraReferenceWriters.length) {
    issues.push(`Not in public writer reference: ${extraReferenceWriters.join(", ")}`);
  }
  return issues.join(". ");
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
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  if (isSubset(leftTokens, rightTokens) || isSubset(rightTokens, leftTokens)) return 1;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size);
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

async function apiFetch(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });
  } catch (error) {
    setBackendStatus("error", "Backend not running");
    throw new Error(
      `Backend request failed. Start FastAPI at ${API_BASE}, then retry. Original error: ${error.message}`,
    );
  }

  if (!response.ok) {
    const message = await readApiError(response);
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json();
}

async function readApiError(response) {
  const text = await response.text();
  if (!text) {
    return "";
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    return text;
  }

  return text;
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
