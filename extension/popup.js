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
  captureButton: document.querySelector("#captureButton"),
  clearCandidatesButton: document.querySelector("#clearCandidatesButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  copyReportButton: document.querySelector("#copyReportButton"),
  candidateCount: document.querySelector("#candidateCount"),
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
  await chrome.tabs.create({
    url: buildAscapSearchUrl(
      state.work.title,
      state.work.performer,
      firstWriterSearchTerm(state.work.writers),
      firstPublisherSearchTerm(state.work.publishers),
    ),
  });
  setStatus("Opened ASCAP search in a new tab.");
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
    }

    state.candidates = mergeCandidates(state.candidates, parsedCandidates);
    state.analysis = null;
    await saveState();
    render();
    setStatus(`Captured ${parsedCandidates.length} ASCAP result(s).`);

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
          <div class="item-meta">${escapeHtml(result.candidate.source)}</div>
          <div class="item-body">
            ${escapeHtml(result.discrepancies.length)} discrepancy item(s). ${escapeHtml(result.matching_evidence.length)} matching signal(s).
          </div>
        </article>
      `,
    )
    .join("");
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

function buildAscapSearchUrl(title, performer, writer, publisher) {
  const encodedTitle = encodeURIComponent(title.trim());
  const encodedPerformer = encodeURIComponent((performer || "").trim());
  const encodedWriter = encodeURIComponent((writer || "").trim());
  const encodedPublisher = encodeURIComponent((publisher || "").trim());
  const base = `https://www.ascap.com/repertory#/ace/search/title/${encodedTitle}`;
  if (encodedPerformer) {
    return `${base}/performer/${encodedPerformer}?at=false&searchFilter=SVW&page=1`;
  }
  if (encodedWriter) {
    return `${base}/writer/${encodedWriter}?at=false&searchFilter=SVW&page=1`;
  }
  if (encodedPublisher) {
    return `${base}/publisher/${encodedPublisher}?at=false&searchFilter=SVW&page=1`;
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
  [...existingCandidates, ...newCandidates].forEach((candidate) => {
    const key = [
      candidate.source || "",
      candidate.public_work_id || "",
      candidate.iswc || "",
      candidate.title || "",
    ]
      .join("|")
      .toLowerCase();
    keyed.set(key, candidate);
  });
  return Array.from(keyed.values());
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
  await expandVisibleAscapResults();
  await waitForPageSettled();

  const results = findAscapResultBlocks();

  if (results.length) {
    return {
      url: window.location.href,
      title: document.title,
      results,
      message: `Captured ${results.length} ASCAP result(s).`,
    };
  }

  return {
    url: window.location.href,
    title: document.title,
    results: [],
    message: "No expanded ASCAP result blocks were found. Search ASCAP, wait for results, then try again.",
  };

  async function expandVisibleAscapResults() {
    const controls = Array.from(document.querySelectorAll("button, a, [role='button']"))
      .filter(isVisible)
      .filter((element) => {
        const text = normalizeText(element.innerText || element.getAttribute("aria-label") || "");
        return /^(\+ )?expand( all)?$/i.test(text) || text.toLowerCase().includes("expand");
      });

    for (const control of controls) {
      try {
        control.click();
        await waitForPageSettled(180);
      } catch {
        // Best effort only. ASCAP can change markup; capture should still continue.
      }
    }
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
      .sort((left, right) => left.top - right.top || left.left - right.left || left.area - right.area);

    const selectedBlocks = [];
    for (const block of blocks) {
      if (selectedBlocks.some((selected) => selected.text.includes(block.text))) {
        continue;
      }
      if (selectedBlocks.some((selected) => block.text.includes(selected.text))) {
        continue;
      }
      selectedBlocks.push(block);
    }

    return dedupeResultTexts(selectedBlocks.map((block) => block.text)).map((text, index) => ({
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

  function dedupeResultTexts(texts) {
    const seen = new Set();
    const deduped = [];
    for (const text of texts) {
      const key = [
        matchValue(text, /\bISWC\s*:?\s*(T[-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[-\s]?\d)\b/i),
        matchValue(text, /\bWork ID\s*:?\s*(\d{5,10})\b/i),
        text.split("\n")[0],
      ]
        .join("|")
        .toLowerCase();
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
