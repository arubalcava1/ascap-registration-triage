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
  copyTitleButton: document.querySelector("#copyTitleButton"),
  searchPlan: document.querySelector("#searchPlan"),
  captureButton: document.querySelector("#captureButton"),
  clearCandidatesButton: document.querySelector("#clearCandidatesButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  candidateCount: document.querySelector("#candidateCount"),
  captureDiagnostics: document.querySelector("#captureDiagnostics"),
  candidateList: document.querySelector("#candidateList"),
  resultsList: document.querySelector("#resultsList"),
  summaryText: document.querySelector("#summaryText"),
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
};

init();

async function init() {
  await loadState();
  bindEvents();
  render();
}

function bindEvents() {
  elements.saveWorkButton.addEventListener("click", saveWorkFromInputs);
  elements.openAscapButton.addEventListener("click", openAscapSearch);
  elements.fillAscapButton.addEventListener("click", fillAscapSearch);
  elements.copyTitleButton.addEventListener("click", copyTitle);
  elements.captureButton.addEventListener("click", captureCurrentTab);
  elements.clearCandidatesButton.addEventListener("click", clearCandidates);
  elements.analyzeButton.addEventListener("click", analyzeCandidates);
  elements.copyReportButton.addEventListener("click", copyReport);

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
  if (!state.work.title.trim()) {
    setStatus("Enter a title before opening ASCAP search.", true);
    return;
  }
  const plan = buildAscapSearchPlan(state.work).slice(0, 4);
  for (const [index, search] of plan.entries()) {
    await chrome.tabs.create({
      url: buildAscapSearchUrl(state.work.title, search.type, search.term),
      active: index === 0,
    });
  }
  setStatus(`Opened ${plan.length} ASCAP search tab(s).`);
}

async function fillAscapSearch() {
  await fillCurrentTabSearch("ASCAP");
}

async function fillCurrentTabSearch(targetSource) {
  saveWorkFromInputs();
  if (!state.work.title.trim()) {
    setStatus("Enter a title before filling search fields.", true);
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

async function copyTitle() {
  saveWorkFromInputs();
  if (!state.work.title.trim()) {
    setStatus("Enter a title first.", true);
    return;
  }
  await navigator.clipboard.writeText(state.work.title.trim());
  setStatus("Title copied.");
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
      throw new Error(result?.message || "No ASCAP repertoire results were captured from this tab.");
    }

    const parsedCandidates = [];
    const parseDiagnostics = [];
    for (const capturedResult of result.results) {
      const parsed = await apiFetch("/api/parse-candidate", {
        method: "POST",
        body: JSON.stringify({
          source: "ASCAP Repertory",
          raw_text: capturedResult.text,
        }),
      });
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
  await saveState();
  render();
  setStatus("Candidates cleared.");
}

async function copyReport() {
  if (!state.analysis?.report_text) {
    setStatus("No report to copy yet.", true);
    return;
  }
  await navigator.clipboard.writeText(state.analysis.report_text);
  setStatus("Report copied.");
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
    .map((line) => {
      const [name, share] = line.split("|").map((part) => part.trim());
      const parsedShare = share ? Number.parseFloat(share.replace("%", "")) : Number.NaN;
      return {
        name,
        ipi_cae: null,
        share: Number.isFinite(parsedShare) ? parsedShare : null,
      };
    });
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
      : `${state.candidates.length} candidate(s) captured.`;
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
          <div class="item-meta">
            ${escapeHtml(candidate.public_work_id || "No public ID")} - ${escapeHtml(candidate.iswc || "No ISWC")}
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
    elements.resultsList.innerHTML = "";
    elements.reportText.textContent = "";
    return;
  }

  elements.summaryText.textContent = state.analysis.summary;
  elements.reportText.textContent = state.analysis.report_text;
  elements.resultsList.innerHTML = state.analysis.results
    .map(
      (result) => `
        <article class="item">
          <div class="item-title">
            <span class="item-name">Rank ${escapeHtml(result.rank)} - ${escapeHtml(result.candidate.title)}</span>
            <span class="score">${escapeHtml(result.confidence_score.toFixed(0))}%<br>${escapeHtml(result.confidence_label)}</span>
          </div>
          <div class="item-meta">${escapeHtml(result.candidate.source)}${formatIdentifierMetaClean(result)}</div>
          ${renderWriterReview(result)}
          ${renderIdentifierReview(result)}
          ${renderEvidenceReview(result)}
        </article>
      `,
    )
    .join("");
}

function renderCaptureDiagnostics() {
  const diagnostics = state.capture_diagnostics;
  if (!diagnostics) {
    elements.captureDiagnostics.classList.add("hidden");
    elements.captureDiagnostics.innerHTML = "";
    return;
  }

  const issueLines = (diagnostics.parse_details || [])
    .filter((item) => item.warnings?.length)
    .map(
      (item) => `
        <div class="diagnostic-row">
          <span>${escapeHtml(item.title || `Result ${item.index}`)}</span>
          <span>${escapeHtml(item.warnings.join(" "))}</span>
        </div>
      `,
    )
    .join("");

  elements.captureDiagnostics.classList.remove("hidden");
  elements.captureDiagnostics.innerHTML = `
    <div class="diagnostic-grid">
      <span>Found ${escapeHtml(diagnostics.found || 0)}</span>
      <span>Parsed ${escapeHtml(diagnostics.parsed || 0)}</span>
      <span>Added ${escapeHtml(diagnostics.added || 0)}</span>
      <span>Duplicates ${escapeHtml(diagnostics.duplicates || 0)}</span>
      <span>Expand clicks ${escapeHtml(diagnostics.expand_clicks || 0)}</span>
    </div>
    ${issueLines ? `<div class="diagnostic-issues">${issueLines}</div>` : ""}
  `;
}

function renderSearchPlan() {
  const plan = buildAscapSearchPlan(state.work);
  if (!state.work.title?.trim()) {
    elements.searchPlan.innerHTML = `<div class="muted-line">Enter a title to prepare ASCAP searches.</div>`;
    return;
  }

  elements.searchPlan.innerHTML = plan
    .slice(0, 4)
    .map(
      (item) => `
        <div class="search-chip">
          <span>${escapeHtml(item.type)}</span>
          <strong>${escapeHtml(state.work.title.trim())}</strong>
          ${item.term ? `<em>${escapeHtml(item.term)}</em>` : ""}
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
  const pieces = [];
  if (result.candidate.public_work_id) {
    pieces.push(`ASCAP Work ID ${result.candidate.public_work_id}`);
  }
  if (state.work.iswc?.trim() && result.candidate.iswc) {
    pieces.push(`ISWC ${result.candidate.iswc}`);
  }
  return pieces.length ? ` - ${escapeHtml(pieces.join(" - "))}` : "";
}

function renderWriterReview(result) {
  const writerDiscrepancies = result.discrepancies.filter((item) => item.field === "writers");
  const missingWriters = writerDiscrepancies.filter((item) => item.type === "missing_writer");
  const extraWriters = writerDiscrepancies.filter((item) => item.type === "extra_writer");
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
    (item) => !["writers", "iswc", "song_code"].includes(item.field),
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
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

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
  if (!title) {
    return [];
  }

  if ((work.performer || "").trim()) {
    return [{ type: "Performer", term: work.performer.trim() }];
  }

  const writers = partySearchTerms(work.writers);
  if (writers.length) {
    return writers.map((term) => ({ type: "Writer", term }));
  }

  const publishers = partySearchTerms(work.publishers);
  if (publishers.length) {
    return publishers.map((term) => ({ type: "Publisher", term }));
  }

  return [{ type: "Title", term: "" }];
}

function buildAscapSearchUrl(title, searchType, searchTerm) {
  const encodedTitle = encodeURIComponent(title.trim());
  const encodedTerm = encodeURIComponent((searchTerm || "").trim());
  const base = `https://www.ascap.com/repertory#/ace/search/title/${encodedTitle}`;
  if (encodedTerm && searchType === "Performer") {
    return `${base}/performer/${encodedTerm}?at=false&searchFilter=SVW&page=1`;
  }
  if (encodedTerm && searchType === "Writer") {
    return `${base}/writer/${encodedTerm}?at=false&searchFilter=SVW&page=1`;
  }
  if (encodedTerm && searchType === "Publisher") {
    return `${base}/publisher/${encodedTerm}?at=false&searchFilter=SVW&page=1`;
  }
  return `${base}?at=false&searchFilter=SVW&page=1`;
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

  const [name] = firstLine.split("|").map((part) => part.trim());
  return name;
}

function partySearchTerms(value) {
  const seen = new Set();
  return (value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|")[0].trim())
    .filter(Boolean)
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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

function fillPublicRepertoireSearch({ targetSource, title, performer, writer, publisher }) {
  const source = targetSource.toLowerCase();
  const host = window.location.hostname.toLowerCase();
  const isAscap = host.includes("ascap.com");

  if (source === "ascap" && !isAscap) {
    return {
      ok: false,
      message: "Open an ASCAP repertory tab before using Fill ASCAP search.",
    };
  }
  return fillAscapPage(title, performer, writer, publisher);

  function fillAscapPage(workTitle, workPerformer, workWriter, workPublisher) {
    const textInputs = visibleTextInputs();
    const titleInput = findInputByNearbyText(textInputs, ["title"]) || textInputs[0];
    const secondary = chooseAscapSecondary(workPerformer, workWriter, workPublisher);
    const secondaryInput =
      findInputByNearbyText(textInputs, [
        secondary.type.toLowerCase(),
        "performer",
        "writer",
        "publisher",
        "artist",
      ]) ||
      textInputs.find((input) => input !== titleInput);

    if (!titleInput) {
      return {
        ok: false,
        message: "Could not find ASCAP title input. Open the ASCAP repertory search page first.",
      };
    }

    setNativeValue(titleInput, workTitle.trim());
    if (secondary.term && secondaryInput) {
      setNativeValue(secondaryInput, secondary.term);
    }
    setSelectNearInput(titleInput, "Title");
    if (secondaryInput) {
      setSelectNearInput(secondaryInput, secondary.type);
    }

    return {
      ok: true,
      message: secondary.term
        ? `Filled ASCAP title and ${secondary.type.toLowerCase()} fields. Review them, then click Search.`
        : "Filled ASCAP title field. Review it, then click Search.",
    };
  }

  function chooseAscapSecondary(workPerformer, workWriter, workPublisher) {
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

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    expandClickCount += await expandVisibleAscapResults();
    await waitForPageSettled(attempt === 1 ? 900 : 1300);
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

    let resultTexts = dedupeResultTexts(selectedBlocks.map((block) => block.text));
    if (resultTexts.length <= 1) {
      resultTexts = dedupeResultTexts(splitAscapResultsFromPageText(document.body?.innerText || ""));
    }

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
    const resultStarts = [];
    for (let index = 0; index < lines.length; index += 1) {
      const current = lines[index];
      const next = lines.slice(index + 1, index + 5).join("\n");
      if (isLikelyTitleLine(current) && /\bISWC\s*:?\s*T[-\s]?\d{3}/i.test(next) && /\bWork ID\s*:?\s*\d{5,10}/i.test(next)) {
        resultStarts.push(index);
      }
    }

    const chunks = [];
    for (let index = 0; index < resultStarts.length; index += 1) {
      const start = resultStarts[index];
      const end = resultStarts[index + 1] || lines.length;
      const chunk = lines.slice(start, end).join("\n");
      if (isLikelyWorkResult({ text: chunk })) {
        chunks.push(chunk);
      }
    }
    return chunks;
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
