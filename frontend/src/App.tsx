import { FormEvent, ReactNode, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ClipboardList,
  Copy,
  ExternalLink,
  Gauge,
  Link2,
  Loader2,
  Music2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  analyzeWork,
  AnalyzeResponse,
  BrowserAssistedSession,
  BrowserAssistedTask,
  CandidateDiscoveryAction,
  CandidateDiscoveryResponse,
  CandidateParseResponse,
  CandidateWork,
  captureBrowserActivePage,
  captureBrowserVisibleText,
  closeBrowserAssistedSession,
  discoverCandidates,
  openBrowserAssistedTask,
  Party,
  parseCandidate,
  startBrowserAssistedSession,
} from "./lib/api";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";

type CandidateDraft = {
  source: string;
  title: string;
  publicWorkId: string;
  iswc: string;
  writers: string;
  publishers: string;
  status: string;
  sourceUrl: string;
  rawNotes: string;
};

const emptyCandidate: CandidateDraft = {
  source: "ASCAP Repertory",
  title: "",
  publicWorkId: "",
  iswc: "",
  writers: "",
  publishers: "",
  status: "",
  sourceUrl: "",
  rawNotes: "",
};

function App() {
  const [title, setTitle] = useState("THE GREATEST");
  const [songCode, setSongCode] = useState("123456789");
  const [iswc, setIswc] = useState("");
  const [performer, setPerformer] = useState("");
  const [writers, setWriters] = useState("Alex Rivera | 50\nJordan Lee | 50");
  const [publishers, setPublishers] = useState("Example Music Publishing | 100");
  const [notes, setNotes] = useState("");
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy report");
  const [copiedSearchSource, setCopiedSearchSource] = useState("");
  const [discovery, setDiscovery] = useState<CandidateDiscoveryResponse | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState("");
  const [pasteSource, setPasteSource] = useState("Songview");
  const [pasteText, setPasteText] = useState("");
  const [parseResult, setParseResult] = useState<CandidateParseResponse | null>(null);
  const [parseError, setParseError] = useState("");
  const [isParsingCandidate, setIsParsingCandidate] = useState(false);
  const [openedSources, setOpenedSources] = useState<string[]>([]);
  const [parsedSources, setParsedSources] = useState<string[]>([]);
  const [browserSession, setBrowserSession] = useState<BrowserAssistedSession | null>(null);
  const [browserAssistError, setBrowserAssistError] = useState("");
  const [isStartingBrowserAssist, setIsStartingBrowserAssist] = useState(false);
  const [userApprovedCapture, setUserApprovedCapture] = useState(false);
  const [isCapturingVisibleText, setIsCapturingVisibleText] = useState(false);
  const [stagedCaptureNotice, setStagedCaptureNotice] = useState("");
  const [activeBrowserSource, setActiveBrowserSource] = useState("");
  const [isOpeningGuidedBrowser, setIsOpeningGuidedBrowser] = useState(false);
  const [isClosingGuidedBrowser, setIsClosingGuidedBrowser] = useState(false);

  const canAnalyze = title.trim().length > 0 && candidates.some((candidate) => candidate.title.trim());
  const topResult = response?.top_result;

  const workflow = useMemo(
    () => [
      { label: "ASCAP work", complete: title.trim().length > 0 },
      { label: "Candidates", complete: candidates.some((candidate) => candidate.title.trim()) },
      { label: "Analysis", complete: Boolean(response) },
    ],
    [candidates, response, title],
  );

  function buildAscapWorkPayload() {
    return {
      title,
      song_code: optional(songCode),
      iswc: optional(iswc),
      alternate_titles: [],
      writers: parseParties(writers),
      publishers: parseParties(publishers),
      source_url: null,
      notes: optional(notes),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const payload = {
        ascap_work: buildAscapWorkPayload(),
        candidates: candidates
          .filter((candidate) => candidate.title.trim())
          .map(toCandidateWork),
      };

      const result = await analyzeWork(payload);
      setResponse(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateCandidate(index: number, patch: Partial<CandidateDraft>) {
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...patch } : candidate,
      ),
    );
  }

  async function copyReport() {
    if (!response?.report_text) {
      return;
    }
    await navigator.clipboard.writeText(response.report_text);
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy report"), 1600);
  }

  async function handleDiscoverCandidates() {
    setDiscoveryError("");
    setIsDiscovering(true);

    try {
      const result = await discoverCandidates({
        ascap_work: buildAscapWorkPayload(),
        performer: optional(performer),
      });
      setDiscovery(result);
      setOpenedSources([]);
      setParsedSources([]);
    } catch (caught) {
      setDiscoveryError(caught instanceof Error ? caught.message : "Discovery failed.");
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleStartBrowserAssist() {
    setBrowserAssistError("");
    setIsStartingBrowserAssist(true);

    try {
      const result = await startBrowserAssistedSession({
        ascap_work: buildAscapWorkPayload(),
        performer: optional(performer),
      });
      setBrowserSession(result);
    } catch (caught) {
      setBrowserAssistError(caught instanceof Error ? caught.message : "Browser-assisted setup failed.");
    } finally {
      setIsStartingBrowserAssist(false);
    }
  }

  async function copySearchTerm(link: CandidateDiscoveryAction) {
    await navigator.clipboard.writeText(primarySearchCopyValue(link));
    setCopiedSearchSource(link.source);
    window.setTimeout(() => setCopiedSearchSource(""), 1600);
  }

  function useDiscoverySource(link: CandidateDiscoveryAction) {
    setPasteSource(parseSourceFromDiscovery(link));
    setParseResult(null);
    setParseError("");
    setStagedCaptureNotice("");
  }

  function openDiscoverySource(link: CandidateDiscoveryAction) {
    setOpenedSources((current) => uniqueValues([...current, link.source]));
    window.open(link.url, "_blank", "noopener");
  }

  async function openBrowserTask(task: BrowserAssistedTask) {
    if (!browserSession) {
      setBrowserAssistError("Start a guided browser session before opening a task.");
      return;
    }

    setBrowserAssistError("");
    setIsOpeningGuidedBrowser(true);

    try {
      const result = await openBrowserAssistedTask({
        session_id: browserSession.session_id,
        task_id: task.task_id,
      });
      setOpenedSources((current) => uniqueValues([...current, task.source]));
      setActiveBrowserSource(parseSourceFromSourceName(result.source));
      stageBrowserCapture(result.source);
      setStagedCaptureNotice(result.message);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Guided browser open failed.";
      if (message.includes("session was not found")) {
        resetGuidedBrowserSession();
        setBrowserAssistError("The guided browser session expired after the backend restarted. Start guided browser search again.");
      } else {
        setBrowserAssistError(message);
      }
    } finally {
      setIsOpeningGuidedBrowser(false);
    }
  }

  function stageBrowserCapture(sourceName: string) {
    const source = parseSourceFromSourceName(sourceName);
    setPasteSource(source);
    setParseResult(null);
    setParseError("");
    setUserApprovedCapture(false);
    setStagedCaptureNotice(
      `${source} capture staged. Paste the visible public result text below, confirm approval, then capture it into a candidate.`,
    );
  }

  async function handleCaptureApprovedVisibleText() {
    if (!browserSession) {
      setParseError("Start a browser-assisted session before capturing visible text.");
      return;
    }

    setParseError("");
    setIsCapturingVisibleText(true);

    try {
      const result = await captureBrowserVisibleText({
        session_id: browserSession.session_id,
        source: pasteSource,
        visible_text: pasteText,
        user_approved_capture: userApprovedCapture,
      });
      setParseResult(result.parse_result);
      setCandidates((current) => [...current, candidateToDraft(result.parse_result.candidate)]);
      setParsedSources((current) => uniqueValues([...current, pasteSource]));
      setPasteText("");
      setUserApprovedCapture(false);
      setStagedCaptureNotice("");
    } catch (caught) {
      setParseError(caught instanceof Error ? caught.message : "Visible text capture failed.");
    } finally {
      setIsCapturingVisibleText(false);
    }
  }

  async function handleCaptureActivePage() {
    if (!browserSession) {
      setParseError("Start a guided browser session before capturing the active page.");
      return;
    }

    setParseError("");
    setIsCapturingVisibleText(true);

    try {
      const result = await captureBrowserActivePage({
        session_id: browserSession.session_id,
        source: activeBrowserSource || pasteSource,
        user_approved_capture: userApprovedCapture,
      });
      setParseResult(result.parse_result);
      setCandidates((current) => [...current, candidateToDraft(result.parse_result.candidate)]);
      setParsedSources((current) => uniqueValues([...current, activeBrowserSource || pasteSource]));
      setPasteText("");
      setUserApprovedCapture(false);
      setStagedCaptureNotice("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Active page capture failed.";
      if (message.includes("session was not found")) {
        resetGuidedBrowserSession();
        setParseError("The guided browser session expired after the backend restarted. Start guided browser search again.");
      } else {
        setParseError(message);
      }
    } finally {
      setIsCapturingVisibleText(false);
    }
  }

  async function handleCloseGuidedBrowser() {
    if (!browserSession) {
      return;
    }

    setIsClosingGuidedBrowser(true);
    try {
      await closeBrowserAssistedSession({ session_id: browserSession.session_id });
      resetGuidedBrowserSession();
    } catch (caught) {
      setBrowserAssistError(caught instanceof Error ? caught.message : "Guided browser close failed.");
    } finally {
      setIsClosingGuidedBrowser(false);
    }
  }

  function resetGuidedBrowserSession() {
    setBrowserSession(null);
    setActiveBrowserSource("");
    setUserApprovedCapture(false);
    setStagedCaptureNotice("");
  }

  async function handleParseCandidate() {
    setParseError("");
    setIsParsingCandidate(true);

    try {
      const result = await parseCandidate({
        source: pasteSource,
        raw_text: pasteText,
      });
      setParseResult(result);
      setCandidates((current) => [...current, candidateToDraft(result.candidate)]);
      setParsedSources((current) => uniqueValues([...current, pasteSource]));
      setPasteText("");
      setStagedCaptureNotice("");
    } catch (caught) {
      setParseError(caught instanceof Error ? caught.message : "Candidate parsing failed.");
    } finally {
      setIsParsingCandidate(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3 text-sm text-sky-200">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-sky-300/30 bg-sky-300/10 shadow-glow">
                <Music2 className="h-4 w-4" />
              </span>
              ASCAP Registration Triage
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-4xl">
              Metadata investigation workspace
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Enter visible ASCAP portal metadata, add public repertoire candidates,
              and generate ranked triage results for human review.
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-2 rounded-lg border border-white/10 bg-white/[0.055] p-2 backdrop-blur-xl">
            {workflow.map((step, index) => (
              <div
                key={step.label}
                className={cn(
                  "flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-400",
                  step.complete && "bg-sky-300/10 text-sky-100",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[11px]",
                    step.complete && "border-sky-300/50 bg-sky-300/15",
                  )}
                >
                  {step.complete ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </div>
            ))}
          </div>
        </header>

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <section className="grid gap-6 xl:grid-cols-2">
            <Card className="glass-line h-full">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>ASCAP Work Metadata</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">Manual-entry fields from the portal record.</p>
                </div>
                <ShieldCheck className="h-5 w-5 text-sky-200" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Work title" className="md:col-span-2">
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </Field>
                  <Field label="Song code">
                    <Input value={songCode} onChange={(event) => setSongCode(event.target.value)} />
                  </Field>
                  <Field label="ISWC">
                    <Input placeholder="Not shown" value={iswc} onChange={(event) => setIswc(event.target.value)} />
                  </Field>
                  <Field label="Known performer / artist">
                    <Input placeholder="Optional" value={performer} onChange={(event) => setPerformer(event.target.value)} />
                  </Field>
                  <Field label="Writers" className="md:col-span-2">
                    <Textarea value={writers} onChange={(event) => setWriters(event.target.value)} />
                  </Field>
                  <Field label="Publishers" className="md:col-span-2">
                    <Textarea value={publishers} onChange={(event) => setPublishers(event.target.value)} />
                  </Field>
                  <Field label="Notes">
                    <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <div className="grid h-full gap-6">
              <Card className="glass-line">
                <CardHeader>
                  <CardTitle>Run Investigation</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">The frontend posts directly to the backend MVP endpoint.</p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Button type="submit" disabled={!canAnalyze || isLoading} className="h-12 w-full">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                    Analyze candidates
                  </Button>

                  {error && (
                    <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      {error}
                    </div>
                  )}

                  <AnimatePresence mode="wait">
                    {topResult ? (
                      <motion.div
                        key="score"
                        initial={{ opacity: 0, y: 12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        className="rounded-lg border border-sky-300/25 bg-sky-300/10 p-5 shadow-glow"
                      >
                        <div className="mb-4 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm text-sky-100">Top candidate</p>
                            <h2 className="mt-1 text-xl font-semibold text-white">{topResult.candidate.title}</h2>
                          </div>
                          <Sparkles className="h-5 w-5 text-sky-200" />
                        </div>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(topResult.confidence_score, 100)}%` }}
                          className="mb-3 h-2 rounded-full bg-sky-300"
                        />
                        <div className="flex items-end justify-between">
                          <div className="text-sm text-slate-300">{topResult.confidence_label}</div>
                          <div className="text-3xl font-semibold text-white">
                            {topResult.confidence_score.toFixed(0)}%
                          </div>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="rounded-lg border border-white/10 bg-slate-950/35 p-5 text-sm text-slate-400"
                      >
                        Results will appear here after analysis.
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {response && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300">{response.summary}</p>
                      <p className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-400">
                        {response.disclaimer}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-line">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Search Public Repertoire</CardTitle>
                    <p className="mt-1 text-sm text-slate-400">
                      Ask the backend to prepare source searches from the ASCAP work metadata.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!title.trim() || isDiscovering}
                      onClick={handleDiscoverCandidates}
                    >
                      {isDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Find public matches
                    </Button>
                    <Button
                      type="button"
                      disabled={!title.trim() || isStartingBrowserAssist}
                      onClick={handleStartBrowserAssist}
                    >
                      {isStartingBrowserAssist ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Start guided browser search
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {(discoveryError || browserAssistError) && (
                    <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100 md:col-span-2">
                      {discoveryError || browserAssistError}
                    </div>
                  )}

                  {!discovery && !browserSession && !discoveryError && !browserAssistError && (
                    <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4 text-sm leading-6 text-slate-400 md:col-span-2">
                      Use this step before adding candidates. The app will prepare public-source search actions from the work title, writer, publisher, and ISWC.
                    </div>
                  )}

                  {browserSession && (
                    <div className="rounded-lg border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-slate-200">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-white">Guided browser discovery prototype</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-300">{browserSession.summary}</p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 shrink-0 px-3 text-xs"
                          disabled={isClosingGuidedBrowser}
                          onClick={handleCloseGuidedBrowser}
                        >
                          {isClosingGuidedBrowser ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ExternalLink className="h-3.5 w-3.5" />
                          )}
                          Close browser
                        </Button>
                      </div>
                      <div className="mb-4 rounded-md border border-white/10 bg-slate-950/35 p-3">
                        <div className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">Guardrails</div>
                        <ul className="space-y-1 text-xs leading-5 text-slate-300">
                          {browserSession.guardrails.map((guardrail) => (
                            <li key={guardrail}>{guardrail}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid gap-3">
                        {browserSession.tasks.map((task) => (
                          <div key={task.task_id} className="rounded-md border border-white/10 bg-slate-950/35 p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium text-slate-100">{task.source}</div>
                              <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100">
                                User approval required
                              </span>
                            </div>
                            <div className="mb-3 grid gap-2 rounded-md border border-white/10 bg-slate-950/45 px-3 py-2 text-xs text-slate-300">
                              {Object.entries(task.search_fields).map(([field, value]) => (
                                <div key={field} className="flex gap-2">
                                  <span className="min-w-20 text-slate-500">{field}</span>
                                  <span>{value}</span>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-9"
                                disabled={isOpeningGuidedBrowser}
                                onClick={() => openBrowserTask(task)}
                              >
                                {isOpeningGuidedBrowser ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-4 w-4" />
                                )}
                                Open in guided browser
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-9"
                                onClick={() => stageBrowserCapture(task.source)}
                              >
                                <ClipboardList className="h-4 w-4" />
                                Use manual paste
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {discovery?.actions.map((link) => {
                    const status = sourceWorkflowStatus({
                      link,
                      openedSources,
                      parsedSources,
                      pasteSource,
                      pasteText,
                      candidates,
                    });

                    return (
                    <div
                      key={link.source}
                      className="rounded-lg border border-white/10 bg-slate-950/35 p-4 shadow-inner-glow"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-slate-100">{link.source}</h3>
                            <span className={cn("rounded-md border px-2 py-1 text-[11px]", status.className)}>
                              {status.label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-400">{link.description}</p>
                        </div>
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0", status.iconClassName)} />
                      </div>
                      <div className="mb-3 grid gap-2 rounded-md border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-200">
                        {Object.entries(link.search_fields).length > 0 ? (
                          Object.entries(link.search_fields).map(([field, value]) => (
                            <div key={field} className="flex gap-2">
                              <span className="min-w-20 text-slate-500">{field}</span>
                              <span>{value}</span>
                            </div>
                          ))
                        ) : (
                          link.search_term
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" className="h-9" onClick={() => copySearchTerm(link)}>
                          <Copy className="h-4 w-4" />
                          {copiedSearchSource === link.source ? "Copied" : "Copy term"}
                        </Button>
                        <Button type="button" variant="secondary" className="h-9" onClick={() => useDiscoverySource(link)}>
                          <ClipboardList className="h-4 w-4" />
                          Use for paste
                        </Button>
                        <Button type="button" className="h-9" onClick={() => openDiscoverySource(link)}>
                          <ExternalLink className="h-4 w-4" />
                          Open source
                        </Button>
                      </div>
                    </div>
                    );
                  })}

                  {discovery && (
                    <p className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-400 md:col-span-2">
                      {discovery.summary} {discovery.disclaimer}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">

            <Card className="glass-line h-full">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Paste Public Result</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">
                    {pasteSourceGuidance(pasteSource)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!pasteText.trim() || isParsingCandidate}
                  onClick={handleParseCandidate}
                >
                  {isParsingCandidate ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                  Parse candidate
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Source">
                  <select
                    className="h-10 w-full rounded-md border border-white/10 bg-slate-950/55 px-3 text-sm text-slate-100 shadow-inner-glow outline-none transition focus:border-sky-300/50 focus:ring-2 focus:ring-sky-300/15"
                    value={pasteSource}
                    onChange={(event) => setPasteSource(event.target.value)}
                  >
                    <option>Songview</option>
                    <option>BMI Repertoire</option>
                    <option>ASCAP Repertory</option>
                  </select>
                </Field>
                <Field label="Copied public result text" className="md:col-span-2">
                  <Textarea
                    className="min-h-36"
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={pasteSourcePlaceholder(pasteSource)}
                  />
                </Field>

                {stagedCaptureNotice && (
                  <div className="rounded-lg border border-sky-300/20 bg-sky-300/10 p-4 text-sm leading-6 text-sky-100 md:col-span-3">
                    {stagedCaptureNotice}
                  </div>
                )}

                {browserSession && (
                  <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4 md:col-span-3">
                    {activeBrowserSource && (
                      <div className="mb-3 rounded-md border border-sky-300/20 bg-sky-300/10 p-3 text-sm text-sky-100">
                        Active guided browser source: {activeBrowserSource}. Open or expand the correct public result in the browser window before capturing.
                      </div>
                    )}
                    <label className="flex items-start gap-3 text-sm leading-5 text-slate-300">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950"
                        checked={userApprovedCapture}
                        onChange={(event) => setUserApprovedCapture(event.target.checked)}
                      />
                      <span>
                        I confirm this text is visible public repertoire page content that I approved for capture. No login credentials, private member data, or blocked content is included.
                      </span>
                    </label>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Button
                        type="button"
                        className="h-10 w-full"
                        disabled={!activeBrowserSource || !userApprovedCapture || isCapturingVisibleText}
                        onClick={handleCaptureActivePage}
                      >
                        {isCapturingVisibleText ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                        Capture active browser page
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full"
                        disabled={!pasteText.trim() || !userApprovedCapture || isCapturingVisibleText}
                        onClick={handleCaptureApprovedVisibleText}
                      >
                        {isCapturingVisibleText ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                        Capture pasted text
                      </Button>
                    </div>
                  </div>
                )}

                {parseError && (
                  <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100 md:col-span-3">
                    {parseError}
                  </div>
                )}

                {parseResult && (
                  <div className="rounded-lg border border-sky-300/20 bg-sky-300/10 p-4 text-sm text-slate-200 md:col-span-3">
                    <div className="mb-2 font-medium">Added parsed candidate: {parseResult.candidate.title}</div>
                    <div className="text-slate-400">
                      Parsed fields: {parseResult.parsed_fields.length ? parseResult.parsed_fields.join(", ") : "none"}
                    </div>
                    {parseResult.warnings.length > 0 && (
                      <ul className="mt-3 space-y-1 text-amber-100">
                        {parseResult.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-line h-full">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Public Repertoire Candidates</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">Add records found in Songview, ASCAP, BMI, or similar sources.</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCandidates((current) => [...current, emptyCandidate])}
                >
                  <Plus className="h-4 w-4" />
                  Add candidate
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {candidates.length === 0 && (
                  <div className="rounded-lg border border-white/10 bg-slate-950/35 p-5 text-sm leading-6 text-slate-400">
                    No public candidates have been added yet. Paste a public repertoire result or add a blank candidate before running analysis.
                  </div>
                )}

                {candidates.map((candidate, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-white/10 bg-slate-950/35 p-4 shadow-inner-glow"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                          <Search className="h-4 w-4 text-sky-200" />
                          Candidate {index + 1}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="rounded-md border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[11px] text-sky-100">
                            {candidate.source || "Public source"}
                          </span>
                          {candidateReadiness(candidate).map((item) => (
                            <span
                              key={item.label}
                              className={cn("rounded-md border px-2 py-1 text-[11px]", item.className)}
                            >
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      {candidates.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() =>
                            setCandidates((current) =>
                              current.filter((_, candidateIndex) => candidateIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      <Field label="Source">
                        <Input
                          value={candidate.source}
                          onChange={(event) => updateCandidate(index, { source: event.target.value })}
                        />
                      </Field>
                      <Field label="Title" className="md:col-span-2">
                        <Input
                          value={candidate.title}
                          onChange={(event) => updateCandidate(index, { title: event.target.value })}
                        />
                      </Field>
                      <Field label="Public ID">
                        <Input
                          value={candidate.publicWorkId}
                          onChange={(event) => updateCandidate(index, { publicWorkId: event.target.value })}
                        />
                      </Field>
                      <Field label="ISWC">
                        <Input
                          value={candidate.iswc}
                          onChange={(event) => updateCandidate(index, { iswc: event.target.value })}
                        />
                      </Field>
                      <Field label="Status">
                        <Input
                          value={candidate.status}
                          onChange={(event) => updateCandidate(index, { status: event.target.value })}
                        />
                      </Field>
                      <Field label="Source URL" className="md:col-span-2">
                        <Input
                          value={candidate.sourceUrl}
                          onChange={(event) => updateCandidate(index, { sourceUrl: event.target.value })}
                        />
                      </Field>
                      <Field label="Writers" className="md:col-span-2">
                        <Textarea
                          value={candidate.writers}
                          onChange={(event) => updateCandidate(index, { writers: event.target.value })}
                        />
                      </Field>
                      <Field label="Publishers" className="md:col-span-2">
                        <Textarea
                          value={candidate.publishers}
                          onChange={(event) => updateCandidate(index, { publishers: event.target.value })}
                        />
                      </Field>
                      <Field label="Raw notes" className="md:col-span-2 2xl:col-span-4">
                        <Textarea
                          value={candidate.rawNotes}
                          onChange={(event) => updateCandidate(index, { rawNotes: event.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </form>

        {response && (
          <section className="grid gap-4">
            <Card className={cn("glass-line", decisionPanelClass(response.review_decision.severity))}>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[0.8fr_1.2fr]">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Review decision</div>
                  <div className="text-2xl font-semibold text-white">{response.review_decision.label}</div>
                  <div className="mt-2 text-sm text-slate-300">
                    Decision score: {response.review_decision.confidence_score.toFixed(0)}%
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/30 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                    <CheckCircle2 className={cn("h-4 w-4", decisionIconClass(response.review_decision.severity))} />
                    Why this decision
                  </div>
                  <ul className="space-y-2 text-sm leading-5 text-slate-400">
                    {response.review_decision.rationale.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center gap-3">
              <ArrowDown className="h-4 w-4 text-sky-200" />
              <h2 className="text-lg font-semibold text-white">Ranked candidate results</h2>
            </div>
            <div className={cn("grid gap-4", response.results.length > 1 && "lg:grid-cols-2")}>
              {response.results.map((result) => (
                <motion.article
                  key={`${result.rank}-${result.candidate.title}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: result.rank * 0.06 }}
                  className="glass-line rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
                >
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                        Rank {result.rank}
                      </div>
                      <h3 className="text-lg font-semibold text-white">{result.candidate.title}</h3>
                      <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                        <Link2 className="h-3.5 w-3.5" />
                        {result.candidate.source}
                      </p>
                    </div>
                    <ScorePill score={result.confidence_score} label={result.confidence_label} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ResultList
                      icon={<ClipboardList className="h-4 w-4 text-sky-200" />}
                      title="Matching evidence"
                      items={result.matching_evidence.map(
                        (item) => `${item.field}: +${item.score_impact.toFixed(1)}`,
                      )}
                      empty="No strong evidence returned."
                    />
                    <ResultList
                      icon={<AlertTriangle className="h-4 w-4 text-amber-200" />}
                      title="Discrepancies"
                      items={result.discrepancies.slice(0, 5).map((item) => item.description)}
                      empty="No discrepancies returned."
                    />
                  </div>

                  <div className="mt-4 rounded-md border border-white/10 bg-slate-950/30 p-4">
                    <div className="mb-3 text-sm font-medium text-slate-200">Normalized comparison</div>
                    <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-2">
                      <ComparisonLine label="ASCAP title" value={result.comparison_details.ascap_title} />
                      <ComparisonLine label="Candidate title" value={result.comparison_details.candidate_title} />
                      <ComparisonLine label="ASCAP ISWC" value={result.comparison_details.ascap_iswc ?? "Not provided"} />
                      <ComparisonLine label="Candidate ISWC" value={result.comparison_details.candidate_iswc ?? "Not provided"} />
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>

            <Card className="glass-line">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Copyable Follow-Up Report</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">
                    Structured text generated from the top candidate, evidence, and discrepancies.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={copyReport}>
                  <Copy className="h-4 w-4" />
                  {copyLabel}
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-slate-950/55 p-4 text-sm leading-6 text-slate-300">
                  {response.report_text}
                </pre>
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}

function ComparisonLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-slate-200">{value || "Not provided"}</div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ScorePill({ score, label }: { score: number; label: string }) {
  return (
    <div className="min-w-24 rounded-md border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-right">
      <div className="text-xl font-semibold text-white">{score.toFixed(0)}%</div>
      <div className="text-xs text-sky-100">{label}</div>
    </div>
  );
}

function decisionPanelClass(severity: "success" | "warning" | "danger"): string {
  if (severity === "success") {
    return "border-emerald-300/25 bg-emerald-300/[0.06]";
  }
  if (severity === "danger") {
    return "border-rose-300/25 bg-rose-300/[0.06]";
  }
  return "border-amber-300/25 bg-amber-300/[0.06]";
}

function decisionIconClass(severity: "success" | "warning" | "danger"): string {
  if (severity === "success") {
    return "text-emerald-200";
  }
  if (severity === "danger") {
    return "text-rose-200";
  }
  return "text-amber-200";
}

function ResultList({
  icon,
  title,
  items,
  empty,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
        {icon}
        {title}
      </div>
      <ul className="space-y-2 text-sm leading-5 text-slate-400">
        {(items.length > 0 ? items : [empty]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function parseParties(value: string): Party[] {
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

function toCandidateWork(candidate: CandidateDraft): CandidateWork {
  return {
    source: candidate.source || "Public repertoire",
    title: candidate.title,
    public_work_id: optional(candidate.publicWorkId),
    iswc: optional(candidate.iswc),
    alternate_titles: [],
    writers: parseParties(candidate.writers),
    publishers: parseParties(candidate.publishers),
    status: optional(candidate.status),
    source_url: optional(candidate.sourceUrl),
    raw_notes: optional(candidate.rawNotes),
  };
}

function candidateToDraft(candidate: CandidateWork): CandidateDraft {
  return {
    source: candidate.source,
    title: candidate.title,
    publicWorkId: candidate.public_work_id ?? "",
    iswc: candidate.iswc ?? "",
    writers: formatParties(candidate.writers),
    publishers: formatParties(candidate.publishers),
    status: candidate.status ?? "",
    sourceUrl: candidate.source_url ?? "",
    rawNotes: candidate.raw_notes ?? "",
  };
}

function formatParties(parties: Party[]): string {
  return parties
    .map((party) => {
      if (party.share === null) {
        return party.name;
      }
      return `${party.name} | ${party.share}`;
    })
    .join("\n");
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function primarySearchCopyValue(link: CandidateDiscoveryAction): string {
  return (
    link.search_fields.title ??
    link.search_fields.iswc ??
    link.search_fields.writer ??
    link.search_fields.publisher ??
    link.search_term
  );
}

function parseSourceFromDiscovery(link: CandidateDiscoveryAction): string {
  return parseSourceFromSourceName(link.source);
}

function parseSourceFromSourceName(sourceName: string): string {
  const source = sourceName.toLowerCase();
  if (source.includes("bmi")) {
    return "BMI Repertoire";
  }
  if (source.includes("ascap")) {
    return "ASCAP Repertory";
  }
  if (source.includes("iswc")) {
    return "BMI Repertoire";
  }
  return "Songview";
}

function pasteSourceGuidance(source: string): string {
  if (source === "ASCAP Repertory") {
    return "Paste the visible ASCAP result panel after opening the matching repertoire record.";
  }
  if (source === "BMI Repertoire") {
    return "Paste the expanded BMI or Songview result details after opening the matching record.";
  }
  return "Paste the visible Songview result details and convert them into an editable candidate.";
}

function pasteSourcePlaceholder(source: string): string {
  if (source === "ASCAP Repertory") {
    return [
      "THE GREATEST",
      "ISWC: T9019887935",
      "Work ID: 423537515",
      "Total Current ASCAP Share: 100%",
      "Writers",
      "ASCAP controls: 50% BMI controls: 0%",
      "PRO IPI",
      "ALEX RIVERA ASCAP 123456789",
      "Publishers",
      "EXAMPLE MUSIC PUBLISHING ASCAP 987654321",
      "Performers",
      "EXAMPLE ARTIST",
    ].join("\n");
  }

  if (source === "BMI Repertoire") {
    return [
      "Title BMI Work ID SV Status Writer / Composer Performer Expand",
      "GREATEST AMERICAN HERO 102809",
      "ALEX RIVERA",
      "JORDAN LEE",
      "WORK ID 102809",
      "ISWC",
      "T9303796998",
      "Writers / Composers",
      "% CONTROLLED BMI: 50%",
      "ALEX RIVERA BMI 12345678",
      "JORDAN LEE BMI 87654321",
      "Publishers",
      "% CONTROLLED BMI: 50%",
      "EXAMPLE MUSIC PUBLISHING BMI 23456789",
    ].join("\n");
  }

  return [
    "THE GREATEST",
    "ISWC: T9019887935",
    "Work ID: 423537515",
    "Writers",
    "ALEX RIVERA ASCAP 123456789",
    "Publishers",
    "EXAMPLE MUSIC PUBLISHING ASCAP 987654321",
    "Alternate Titles",
    "GREATEST, THE",
  ].join("\n");
}

function sourceWorkflowStatus({
  link,
  openedSources,
  parsedSources,
  pasteSource,
  pasteText,
  candidates,
}: {
  link: CandidateDiscoveryAction;
  openedSources: string[];
  parsedSources: string[];
  pasteSource: string;
  pasteText: string;
  candidates: CandidateDraft[];
}) {
  const parsedSource = parseSourceFromDiscovery(link);
  const hasCandidate = candidates.some((candidate) => candidate.source === parsedSource && candidate.title.trim());

  if (hasCandidate || parsedSources.includes(parsedSource)) {
    return {
      label: "Added",
      className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
      iconClassName: "text-emerald-200",
    };
  }

  if (pasteSource === parsedSource && pasteText.trim()) {
    return {
      label: "Pasted",
      className: "border-sky-300/30 bg-sky-300/10 text-sky-100",
      iconClassName: "text-sky-200",
    };
  }

  if (openedSources.includes(link.source)) {
    return {
      label: "Opened",
      className: "border-amber-300/30 bg-amber-300/10 text-amber-100",
      iconClassName: "text-amber-200",
    };
  }

  return {
    label: "Not searched",
    className: "border-white/10 bg-white/[0.04] text-slate-400",
    iconClassName: "text-slate-500",
  };
}

function candidateReadiness(candidate: CandidateDraft) {
  return [
    readinessBadge("Title", Boolean(candidate.title.trim())),
    readinessBadge("ISWC", Boolean(candidate.iswc.trim())),
    readinessBadge("Writers", Boolean(candidate.writers.trim())),
    readinessBadge("Publishers", Boolean(candidate.publishers.trim())),
  ];
}

function readinessBadge(label: string, ready: boolean) {
  return {
    label: ready ? `Has ${label}` : `Missing ${label}`,
    className: ready
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-white/10 bg-white/[0.035] text-slate-500",
  };
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export default App;
