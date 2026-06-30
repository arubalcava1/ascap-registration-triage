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
  CandidateDiscoveryAction,
  CandidateDiscoveryResponse,
  CandidateParseResponse,
  CandidateWork,
  discoverCandidates,
  Party,
  parseCandidate,
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

const initialCandidate: CandidateDraft = {
  source: "Songview",
  title: "GREATEST, THE",
  publicWorkId: "SV-12345",
  iswc: "T-123456789-0",
  writers: "Andrew Rubalcava | 33.33\nJane Smith | 33.33\nMark Lee | 33.34",
  publishers: "Example Publishing\nOther Music Publishing",
  status: "",
  sourceUrl: "",
  rawNotes: "",
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
  const [writers, setWriters] = useState("Andrew Rubalcava | 50\nJane Smith | 50");
  const [publishers, setPublishers] = useState("Example Publishing | 100");
  const [notes, setNotes] = useState("");
  const [candidates, setCandidates] = useState<CandidateDraft[]>([initialCandidate]);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const payload = {
        ascap_work: {
          title,
          song_code: optional(songCode),
          iswc: optional(iswc),
          alternate_titles: [],
          writers: parseParties(writers),
          publishers: parseParties(publishers),
          source_url: null,
          notes: optional(notes),
        },
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
        ascap_work: {
          title,
          song_code: optional(songCode),
          iswc: optional(iswc),
          alternate_titles: [],
          writers: parseParties(writers),
          publishers: parseParties(publishers),
          source_url: null,
          notes: optional(notes),
        },
      });
      setDiscovery(result);
    } catch (caught) {
      setDiscoveryError(caught instanceof Error ? caught.message : "Discovery failed.");
    } finally {
      setIsDiscovering(false);
    }
  }

  async function copySearchTerm(link: CandidateDiscoveryAction) {
    await navigator.clipboard.writeText(link.search_term);
    setCopiedSearchSource(link.source);
    window.setTimeout(() => setCopiedSearchSource(""), 1600);
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

        <form className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]" onSubmit={handleSubmit}>
          <section className="flex flex-col gap-6">
            <Card className="glass-line">
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

            <Card className="glass-line">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Search Public Repertoire</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">
                    Ask the backend to prepare source searches from the ASCAP work metadata.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!title.trim() || isDiscovering}
                  onClick={handleDiscoverCandidates}
                >
                  {isDiscovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Find public matches
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {discoveryError && (
                  <div className="rounded-md border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100 md:col-span-2">
                    {discoveryError}
                  </div>
                )}

                {!discovery && !discoveryError && (
                  <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4 text-sm leading-6 text-slate-400 md:col-span-2">
                    Use this step before adding candidates. The app will prepare public-source search actions from the work title, writer, publisher, and ISWC.
                  </div>
                )}

                {discovery?.actions.map((link) => (
                  <div
                    key={link.source}
                    className="rounded-lg border border-white/10 bg-slate-950/35 p-4 shadow-inner-glow"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{link.source}</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{link.description}</p>
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 text-sky-200" />
                    </div>
                    <div className="mb-3 rounded-md border border-white/10 bg-slate-950/55 px-3 py-2 text-sm text-slate-200">
                      {link.search_term}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" className="h-9" onClick={() => copySearchTerm(link)}>
                        <Copy className="h-4 w-4" />
                        {copiedSearchSource === link.source ? "Copied" : "Copy term"}
                      </Button>
                      <Button type="button" className="h-9" onClick={() => window.open(link.url, "_blank", "noopener")}>
                        <ExternalLink className="h-4 w-4" />
                        Open source
                      </Button>
                    </div>
                  </div>
                ))}

                {discovery && (
                  <p className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-slate-400 md:col-span-2">
                    {discovery.summary} {discovery.disclaimer}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="glass-line">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Paste Public Result</CardTitle>
                  <p className="mt-1 text-sm text-slate-400">
                    Paste visible public repertoire text and convert it into an editable candidate.
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
                  <Input value={pasteSource} onChange={(event) => setPasteSource(event.target.value)} />
                </Field>
                <Field label="Copied public result text" className="md:col-span-2">
                  <Textarea
                    className="min-h-36"
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder={"Title: GREATEST, THE\nISWC: T-123456789-0\nWriters:\nAndrew Rubalcava | 33.33%"}
                  />
                </Field>

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

            <Card className="glass-line">
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
                {candidates.map((candidate, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-white/10 bg-slate-950/35 p-4 shadow-inner-glow"
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                        <Search className="h-4 w-4 text-sky-200" />
                        Candidate {index + 1}
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
                    <div className="grid gap-4 md:grid-cols-4">
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
                      <Field label="Raw notes" className="md:col-span-4">
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

          <aside className="flex flex-col gap-6">
            <Card className="glass-line sticky top-6">
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
          </aside>
        </form>

        {response && (
          <section className="grid gap-4">
            <div className="flex items-center gap-3">
              <ArrowDown className="h-4 w-4 text-sky-200" />
              <h2 className="text-lg font-semibold text-white">Ranked candidate results</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
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

export default App;
