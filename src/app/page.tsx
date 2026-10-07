"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Hammer, Layers, Loader2, PlayCircle, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  acceptCheck,
  buildChecksFile,
  buildJournal,
  deleteViator,
  downloadJournal,
  downloadSummary,
  downloadTask,
  downloadZip,
  generateSummary,
  getLatestRunForMonth,
  getRun,
  getSettings,
  retryTask,
  addReport,
  saveFx,
  scanFx,
  startRun,
  uploadViator,
  type Check,
  type FileKey,
  type FileTask,
  type Journal,
  type JournalKey,
  type Run,
  type Settings,
} from "@/lib/api";
import { money, monthLabel, monthRange, previousMonth, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DownloadsMatrix } from "@/components/close/downloads";
import { FxTable, rateError } from "@/components/close/fx-table";
import { JournalPanel } from "@/components/close/journal-panel";
import { ViatorUploads } from "@/components/close/viator-uploads";
import { RuleTestPanel } from "@/components/close/rule-test";
import { Notice, Stat, StepIcon, StepSection, inputClass, type StepState } from "@/components/close/ui";

type StepId = "month" | "files" | "fx" | "xola" | "deferred" | "viator" | "checks";

const STEPS: { id: StepId; title: string }[] = [
  { id: "month", title: "Month" },
  { id: "files", title: "Downloads" },
  { id: "fx", title: "FX rates" },
  { id: "xola", title: "Xola journal" },
  { id: "deferred", title: "Deferred revenue" },
  { id: "viator", title: "Viator journal" },
  { id: "checks", title: "Checks file" },
];

function journalState(j: Journal): StepState {
  if (j.status === "generating") return "running";
  if (j.status === "failed") return "blocked";
  if (j.status === "idle" || !j.generatedAt) return "todo";
  if (j.stale) return "warn";
  if (j.status === "blocked") return "blocked";
  return "done";
}

const isBuilt = (j: Journal) => ["ready", "blocked"].includes(j.status) && !!j.generatedAt;

export default function HomePage() {
  const [month, setMonth] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StepId, string>>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedFor = useRef<string | null>(null);

  const range = monthRange(month);
  const runForMonth = run && run.month === month ? run : null;

  const isBusy = (r: Run) =>
    r.status === "running" || r.summaries?.account?.status === "generating" || r.summaries?.payout?.status === "generating";

  const setError = (step: StepId, msg: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (msg) next[step] = msg;
      else delete next[step];
      return next;
    });

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setIsPolling(false);
  };

  const poll = useCallback(async (id: string) => {
    try {
      const next = await getRun(id);
      setRun(next);
      if (!isBusy(next)) stopPolling();
    } catch (e) {
      setError("files", (e as Error).message);
    }
  }, []);

  const ensurePolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      setIsPolling(true);
      pollRef.current = setInterval(() => poll(id), 4000);
    },
    [poll]
  );

  // Load: last month + settings. Nothing is generated automatically.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = previousMonth();
      setMonth(m);
      getSettings()
        .then((s) => !cancelled && setSettings(s))
        .catch(() => {});
      try {
        const existing = await getLatestRunForMonth(m);
        if (!cancelled) setRun(existing);
      } catch {
        /* none yet */
      }
      if (!cancelled) setRestoring(false);
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Run an action for a step: busy spinner + error shown on that step.
  async function act(step: StepId, name: string, fn: () => Promise<Run | void>) {
    setBusy(name);
    setError(step, null);
    try {
      const next = await fn();
      if (next) setRun(next);
    } catch (e) {
      setError(step, (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Once the downloads have settled, work out which FX rates are needed (read-only
  // scan of the files; nothing is posted).
  useEffect(() => {
    if (!runForMonth || isBusy(runForMonth) || runForMonth.fxScannedAt) return;
    if (!runForMonth.account.some((t) => t.status === "done")) return;
    if (scannedFor.current === runForMonth.id) return;
    scannedFor.current = runForMonth.id;
    scanFx(runForMonth.id)
      .then(setRun)
      .catch((e) => setError("fx", (e as Error).message));
  }, [runForMonth]);

  async function handleMonthChange(m: string) {
    if (isPolling) return;
    setMonth(m);
    setErrors({});
    try {
      setRun(await getLatestRunForMonth(m));
    } catch {
      setRun(null);
    }
  }

  function handleStart() {
    act("month", "start", async () => {
      const created = await startRun(month);
      ensurePolling(created.id);
      return created;
    });
  }

  function handleResume() {
    if (!runForMonth) return;
    poll(runForMonth.id);
    ensurePolling(runForMonth.id);
  }

  async function handleRetry(taskId: string) {
    if (!run) return;
    setError("files", null);
    const flip = (ts: FileTask[]) => ts.map((t) => (t.id === taskId ? { ...t, status: "exporting" as const, error: null } : t));
    setRun((r) => (r ? { ...r, account: flip(r.account), payout: flip(r.payout), earnings: flip(r.earnings) } : r));
    ensurePolling(run.id);
    try {
      await retryTask(taskId);
    } catch (e) {
      setError("files", (e as Error).message);
    }
    poll(run.id);
  }

  const download = (step: StepId, fn: () => Promise<void>) => act(step, "download", async () => fn());

  const onAccept = (key: JournalKey) => async (c: Check, reason: string) => {
    if (!run) return;
    setRun(await acceptCheck(run.id, key, { checkId: c.id, location: c.location, reason }));
  };

  const onDownloadJournal = (step: StepId) => (key: FileKey, name: string) =>
    run && download(step, () => downloadJournal(run.id, key, name));

  // ---- step states ------------------------------------------------------------
  const r = runForMonth;
  const running = !!r && r.status === "running";
  const settled = !!r && !running;
  const fxMissing = r ? r.fxRates.filter((x) => rateError(x.currency, x.rate === null ? "" : String(x.rate), settings?.fxLimits || { GBP: { min: 1.25, max: 1.45, bankAccount: "" }, EUR: { min: 1.05, max: 1.25, bankAccount: "" } })).length : 0;
  const anyBuilt = !!r && (["xola", "deferred", "viator"] as JournalKey[]).some((k) => isBuilt(r.journals[k]));

  const states: Record<StepId, StepState> = {
    month: !r ? "todo" : running ? "running" : r.status === "failed" ? "blocked" : "done",
    files: !r ? "locked" : running ? "running" : r.failedTasks > 0 || r.companies.missing.length ? "warn" : "done",
    fx: !settled ? "locked" : !r.fxScannedAt ? "todo" : fxMissing ? "todo" : "done",
    xola: !settled ? "locked" : journalState(r.journals.xola),
    deferred: !settled || !isBuilt(r.journals.xola) ? "locked" : journalState(r.journals.deferred),
    viator: !settled ? "locked" : r.viator.length === 0 && r.journals.viator.status === "idle" ? "todo" : journalState(r.journals.viator),
    checks: !anyBuilt ? "locked" : r.journals.checks.status === "ready" ? "done" : "todo",
  };

  const pct = r && r.totalTasks ? Math.round((r.doneTasks / r.totalTasks) * 100) : 0;
  const doneCount = Object.values(states).filter((s) => s === "done").length;

  const buildButton = (key: JournalKey, label: string, disabled = false) => {
    const j = r?.journals[key];
    const again = j && j.status !== "idle";
    return (
      <Button onClick={() => r && act(key, `build-${key}`, () => buildJournal(r.id, key))} disabled={disabled || busy !== null}>
        {busy === `build-${key}` ? <Loader2 className="animate-spin" /> : again ? <RotateCw /> : <Hammer />}
        {busy === `build-${key}` ? "Building…" : again ? `Rebuild ${label}` : `Build ${label}`}
      </Button>
    );
  };

  const stepError = (id: StepId) => errors[id] && <Notice tone="danger" className="mb-3">{errors[id]}</Notice>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">SOP-ACCT-SALES-001 v1.3</p>
          <h1 className="text-2xl font-semibold tracking-tight">Month-end sales close{month && ` · ${monthLabel(month)}`}</h1>
          <p className="text-sm text-muted-foreground">
            Download Xola reports, enter FX rates, then build and check the XOLA, DEF and VIA journals for QuickBooks.
          </p>
        </div>
        {r && (
          <Button
            variant="outline"
            disabled={busy === "download" || r.doneTasks === 0 || running}
            onClick={() => download("files", () => downloadZip(r.id, r.month))}
          >
            {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download everything (.zip)
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Step rail */}
        <nav className="hidden lg:block" aria-label="Steps">
          <div className="sticky top-20 space-y-1">
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              {doneCount} of {STEPS.length} steps done
            </p>
            {STEPS.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted",
                  states[s.id] === "locked" && "text-muted-foreground"
                )}
              >
                <StepIcon state={states[s.id]} n={i + 1} className="size-6" />
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {/* 1. Month */}
          <StepSection
            id="month"
            n={1}
            title="Choose the month and download"
            description="The first and last day of the month set the date range for every Xola export."
            state={states.month}
          >
            {stepError("month")}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="space-y-1">
                <label htmlFor="month" className="text-xs font-medium">
                  Month
                </label>
                <input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  disabled={isPolling || restoring}
                  className={cn(inputClass, "w-full sm:w-48")}
                />
              </div>
              {range && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{range.from}</span> → <span className="font-mono text-xs">{range.to}</span>
                </p>
              )}
              <div className="flex gap-2 sm:ml-auto">
                {running && !isPolling && (
                  <Button onClick={handleResume}>
                    <PlayCircle /> Resume watching
                  </Button>
                )}
                <Button
                  onClick={handleStart}
                  disabled={busy !== null || isPolling || restoring || !range}
                  variant={r ? "outline" : "default"}
                >
                  {busy === "start" ? <Loader2 className="animate-spin" /> : r ? <RotateCw /> : <PlayCircle />}
                  {r ? "Download again" : "Generate"}
                </Button>
              </div>
            </div>

            {r && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {r.phase === "fetching_delegators" && "Getting the seller list from Xola…"}
                    {r.phase === "processing" && `Exporting ${r.totalTasks} files (${r.sellerCount} sellers × Cash Flow, Payout, Recognized Earnings)…`}
                    {r.phase === "done" &&
                      (r.status === "completed"
                        ? `All ${r.totalTasks} files downloaded and verified.`
                        : r.status === "completed_with_errors"
                          ? `${r.failedTasks} file(s) failed — retry them in step 2.`
                          : r.error || "The run failed.")}
                    {r.phase === "created" && "Starting…"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Started {when(r.createdAt)}
                    {r.createdBy && ` by ${r.createdBy}`}
                  </span>
                </div>
                <Progress value={pct} />
                {running && !isPolling && (
                  <p className="text-xs text-muted-foreground">
                    This month is still downloading. Click “Resume watching” to follow it, or “Download again” to start over.
                  </p>
                )}
              </div>
            )}
          </StepSection>

          {/* 2. Downloads */}
          <StepSection
            id="files"
            n={2}
            title="Check the three downloads"
            description="Cash Flow, Payout and Recognized Earnings for every company, each verified against its Report Details sheet."
            state={states.files}
            lockedReason="Pick a month and click Generate."
          >
            {stepError("files")}
            {r && (
              <>
                <DownloadsMatrix
                  run={r}
                  onRetry={handleRetry}
                  onDownload={(t) => download("files", () => downloadTask(t.id, t.fileName || "export.xlsx"))}
                />
                {settled && r.doneTasks > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
                    <Layers className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Combined Summary workbooks:</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null || r.summaries.account.status === "generating"}
                      onClick={() =>
                        act("files", "summary", async () => {
                          const next = await generateSummary(r.id);
                          ensurePolling(r.id);
                          return { ...next, summaries: { account: { ...next.summaries.account, status: "generating" }, payout: { ...next.summaries.payout, status: "generating" } } };
                        })
                      }
                    >
                      {r.summaries.account.status === "generating" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                      {r.summaries.account.status === "ready" ? "Rebuild" : "Build"}
                    </Button>
                    {(["account", "payout"] as const).map(
                      (t) =>
                        r.summaries[t].status === "ready" && (
                          <Button key={t} size="sm" variant="ghost" onClick={() => download("files", () => downloadSummary(r.id, t))}>
                            <Download /> summary_{t}.xlsx
                          </Button>
                        )
                    )}
                  </div>
                )}
              </>
            )}
          </StepSection>

          {/* 3. FX */}
          <StepSection
            id="fx"
            n={3}
            title="Enter FX rates"
            description="London is GBP; Amsterdam, Paris and Milan are EUR. Each row converts at its own payout date's banked rate."
            state={states.fx}
            lockedReason="Available once the downloads have finished."
            actions={
              r && (
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act("fx", "scan", () => scanFx(r.id))}>
                  {busy === "scan" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Find rates needed
                </Button>
              )
            }
          >
            {stepError("fx")}
            {r && (
              <FxTable
                key={JSON.stringify(r.fxRates.map((x) => [x.location, x.currency, x.date, x.rate]))}
                run={r}
                settings={settings}
                onSave={async (rates) => {
                  setError("fx", null);
                  try {
                    setRun(await saveFx(r.id, rates));
                  } catch (e) {
                    setError("fx", (e as Error).message);
                    setRun(await getRun(r.id));
                  }
                }}
              />
            )}
          </StepSection>

          {/* 4. XOLA */}
          <StepSection
            id="xola"
            n={4}
            title="Build the Xola sales journal"
            description="From each company's Transactions sheet: clearing account per Source, fees, gross — Viator and unpaid office bookings left out."
            state={states.xola}
            lockedReason="Available once the downloads have finished."
            actions={buildButton("xola", "XOLA")}
          >
            {stepError("xola")}
            {r && (
              <JournalPanel
                journalKey="xola"
                journal={r.journals.xola}
                accepted={r.acceptedDiffs}
                onAccept={onAccept("xola")}
                onDownload={onDownloadJournal("xola")}
                emptyHint={fxMissing ? `Enter the ${fxMissing} missing FX rate(s) in step 3 first — the build is blocked until they're in.` : "Click “Build XOLA” to create the journal and run the 14 checks."}
                extraDownloads={[
                  {
                    key: "office",
                    label: `${r.journals.office.journalNo || "OFFICE"} (${r.journals.office.rowCount} bookings)`,
                    name: r.journals.office.fileName || "OFFICE.xlsx",
                    enabled: r.journals.office.status === "ready",
                  },
                ]}
                figures={
                  r.journals.xola.locations.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Location</th>
                            <th className="px-3 py-2 font-medium">Class</th>
                            <th className="px-3 py-2 text-right font-medium">Rows</th>
                            <th className="px-3 py-2 text-right font-medium">Left out (Viator / office)</th>
                            <th className="px-3 py-2 text-right font-medium">Clearing (USD)</th>
                            <th className="px-3 py-2 text-right font-medium">Gross (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.journals.xola.locations.map((l) => (
                            <tr key={l.location} className="border-t">
                              <td className="px-3 py-2 font-medium">
                                {l.location} {l.currency !== "USD" && <span className="text-xs text-muted-foreground">· {l.currency}</span>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{l.class}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{l.rows}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {l.viatorRows} / {l.officeRows}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{money(l.clearingCents)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{money(l.grossUsdCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                }
              />
            )}
          </StepSection>

          {/* 5. Deferred */}
          <StepSection
            id="deferred"
            n={5}
            title="Build the deferred revenue journal"
            description="Cash Flow (XOLA clearing) minus Recognized Earnings, per location. Never reversed."
            state={states.deferred}
            lockedReason="Build the XOLA journal first."
            actions={buildButton("deferred", "DEF")}
          >
            {stepError("deferred")}
            {r && r.earnings.length === 0 && (
              <Notice tone="warn" title="This month has no Recognized Earnings files yet" className="mb-3">
                <div className="space-y-2">
                  <p>It was downloaded before that report was added. Get just those files for every company; everything else (rates, accepted checks, the XOLA journal) stays as it is.</p>
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      act("deferred", "earnings", async () => {
                        const res = await addReport(r.id, "earnings");
                        ensurePolling(r.id);
                        return res.run;
                      })
                    }
                  >
                    {busy === "earnings" ? <Loader2 className="animate-spin" /> : <Download />} Download Recognized Earnings
                  </Button>
                </div>
              </Notice>
            )}
            {r && r.earnings.length > 0 && r.earnings.some((t) => t.status !== "done" && t.status !== "failed") && (
              <Notice tone="info" className="mb-3">
                Downloading Recognized Earnings: {r.earnings.filter((t) => t.status === "done").length} of {r.earnings.length} ready…
              </Notice>
            )}
            {r && (
              <JournalPanel
                journalKey="deferred"
                journal={r.journals.deferred}
                accepted={r.acceptedDiffs}
                onAccept={onAccept("deferred")}
                onDownload={onDownloadJournal("deferred")}
                emptyHint="Click “Build DEF” to compare Cash Flow with Recognized Earnings."
                figures={
                  r.journals.deferred.figures.length > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Stat label="Cash Flow" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.cashFlowCents || 0), 0))} />
                        <Stat label="Recognized Earnings" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.recognizedCents || 0), 0))} />
                        <Stat label="Deferred" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.deferredCents || 0), 0))} />
                      </div>
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full min-w-[600px] text-sm">
                          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Location</th>
                              <th className="px-3 py-2 text-right font-medium">Cash Flow</th>
                              <th className="px-3 py-2 text-right font-medium">Recognized</th>
                              <th className="px-3 py-2 text-right font-medium">Deferred</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.journals.deferred.figures.map((f) => (
                              <tr key={f.location} className="border-t">
                                <td className="px-3 py-2 font-medium">{f.location}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(f.cashFlowCents)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(f.recognizedCents)}</td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums">{money(f.deferredCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {r.journals.deferred.ruleTest && <RuleTestPanel test={r.journals.deferred.ruleTest} />}
                    </div>
                  )
                }
              />
            )}
          </StepSection>

          {/* 6. Viator */}
          <StepSection
            id="viator"
            n={6}
            title="Viator: upload advices and build"
            description="One payment advice per entity. Posted at the net amount on the advice — no gross-up, no commission."
            state={states.viator}
            lockedReason="Available once the downloads have finished."
            actions={buildButton("viator", "VIA", !r || r.viator.length === 0)}
          >
            {stepError("viator")}
            {r && (
              <div className="space-y-5">
                <ViatorUploads
                  run={r}
                  settings={settings}
                  onUpload={async (location, file) => {
                    const next = await uploadViator(r.id, location, file);
                    setRun(next);
                    setRun(await scanFx(r.id)); // an advice may need a rate
                  }}
                  onDelete={(id) => act("viator", "delete", () => deleteViator(r.id, id))}
                  onDownload={(t) => download("viator", () => downloadTask(t.id, t.fileName || "advice"))}
                />
                {(r.journals.viator.status !== "idle" || r.journals.viator.generatedAt) && (
                  <JournalPanel
                    journalKey="viator"
                    journal={r.journals.viator}
                    accepted={r.acceptedDiffs}
                    onAccept={onAccept("viator")}
                    onDownload={onDownloadJournal("viator")}
                    emptyHint=""
                    figures={
                      r.journals.viator.figures.length > 0 && (
                        <div className="overflow-x-auto rounded-xl border">
                          <table className="w-full min-w-[560px] text-sm">
                            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                              <tr>
                                <th className="px-3 py-2 font-medium">Location</th>
                                <th className="px-3 py-2 font-medium">Class</th>
                                <th className="px-3 py-2 text-right font-medium">Advice (local)</th>
                                <th className="px-3 py-2 text-right font-medium">Posted (USD)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.journals.viator.figures.map((f) => (
                                <tr key={f.location} className="border-t">
                                  <td className="px-3 py-2 font-medium">{f.location}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{f.class}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{money(f.adviceLocalCents, f.currency)}</td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums">{money(f.adviceUsdCents)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    }
                  />
                )}
              </div>
            )}
          </StepSection>

          {/* 7. Checks file */}
          <StepSection
            id="checks"
            n={7}
            title="Download the checks file"
            description="Every check result, the run date, who built it, the FX rates used and every accepted difference — for the close binder."
            state={states.checks}
            lockedReason="Build at least one journal first."
          >
            {stepError("checks")}
            {r && (
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={busy !== null} onClick={() => act("checks", "checks", () => buildChecksFile(r.id))}>
                  {busy === "checks" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                  {r.journals.checks.status === "ready" ? "Refresh" : "Create"} {r.journals.checks.journalNo || `CHECKS-${r.month}`}
                </Button>
                {r.journals.checks.status === "ready" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => download("checks", () => downloadJournal(r.id, "checks", r.journals.checks.fileName || "CHECKS.xlsx"))}
                    >
                      <Download /> Download
                    </Button>
                    <span className="text-sm text-muted-foreground">Created {when(r.journals.checks.generatedAt)}</span>
                  </>
                )}
              </div>
            )}
          </StepSection>
        </div>
      </div>
    </main>
  );
}
