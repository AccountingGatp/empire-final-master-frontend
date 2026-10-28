"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, FileSpreadsheet, Hammer, Layers, Loader2, PlayCircle, RefreshCw, RotateCw, Rocket } from "lucide-react";
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
import { FxSummary, FxTable, rateError } from "@/components/close/fx-table";
import { JournalPanel } from "@/components/close/journal-panel";
import { ViatorUploads } from "@/components/close/viator-uploads";
import { SourceBreakdown } from "@/components/close/source-breakdown";
import { Notice, Stat, StepSection, inputClass, type StepState } from "@/components/close/ui";

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

// True when `iso` is on or before the last day of the month (`to` = YYYY-MM-DD),
// i.e. the month was not over yet.
function beforeMonthEnd(iso: string | null | undefined, to: string) {
  if (!iso || !to) return false;
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return new Date(iso) < end;
}

export default function HomePage() {
  const [month, setMonth] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fxOpen, setFxOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<StepId, string>>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedFor = useRef<string | null>(null);
  const settlePolls = useRef(0);
  // Steps the person opened or closed by hand; forgotten whenever the current step moves on.
  const [manual, setManual] = useState<{ at: StepId | null; map: Partial<Record<StepId, boolean>> }>({ at: null, map: {} });

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
      if (!isBusy(next)) {
        // The server now scans FX and builds the summaries by itself right after the
        // downloads: keep watching a little longer so they appear without a click.
        const followUps = next.doneTasks > 0 && next.summaries.account.status === "idle" && settlePolls.current++ < 8;
        if (!followUps) stopPolling();
      }
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
    settlePolls.current = 0;
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
  const viatorInXola = settings?.options?.viatorInXola === true;
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

  // ---- which step is "current" (the one that needs the person next) -----------------
  const skipViator = !!r && viatorInXola && r.viator.length === 0;
  const current: StepId | null =
    STEPS.map((x) => x.id).find((id) => !(states[id] === "done" || states[id] === "locked" || (id === "viator" && skipViator))) ?? null;

  // When the current step changes, scroll to it.
  useEffect(() => {
    if (restoring || !current || current === "month") return;
    const t = setTimeout(() => document.getElementById(current)?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
    return () => clearTimeout(t);
  }, [current, restoring]);

  const isOpen = (id: StepId) => (manual.at === current ? manual.map[id] : undefined) ?? current === id;
  const sp = (id: StepId, n: number) => ({
    id,
    n,
    state: states[id],
    open: isOpen(id),
    current: current === id,
    quiet: id === "viator" && skipViator,
    onToggle: () => setManual({ at: current, map: { ...(manual.at === current ? manual.map : {}), [id]: !isOpen(id) } }),
  });
  const jSummary = (j?: Journal) => (j?.journalNo && j.generatedAt ? `${j.journalNo} · ${j.stale ? "out of date" : j.status === "blocked" ? "blocked" : "built"}` : undefined);
  const nextTitle = current === "month" ? (r ? "Wait for the downloads" : "Pick the month and start") : current ? STEPS.find((x) => x.id === current)?.title : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
      {/* Hero */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Month-end close</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {month ? monthLabel(month) : "Loading…"}
            {r && ` · ${doneCount} of ${STEPS.length} steps done`}
          </p>
        </div>
        {r && (
          <Button
            variant="outline"
            disabled={busy === "download" || r.doneTasks === 0 || running}
            onClick={() => download("files", () => downloadZip(r.id, r.month))}
          >
            {busy === "download" ? <Loader2 className="animate-spin" /> : <Download />} Download all
          </Button>
        )}
      </div>

      {/* Progress strip */}
      <div className="mb-6" aria-label="Progress">
        <div className="flex gap-1.5">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.title}
              disabled={states[s.id] === "locked"}
              onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className={cn(
                "h-2 flex-1 rounded-full transition-colors",
                states[s.id] === "done" && "bg-emerald-500",
                states[s.id] === "running" && "bg-primary/60 animate-pulse",
                (states[s.id] === "todo" || states[s.id] === "warn") && !(s.id === "viator" && skipViator) && "bg-primary",
                states[s.id] === "blocked" && "bg-red-500",
                (states[s.id] === "locked" || (s.id === "viator" && skipViator && states[s.id] === "todo")) && "bg-border"
              )}
            />
          ))}
        </div>
        {nextTitle && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowRight className="size-3.5 text-primary" /> Next: <span className="font-medium text-foreground">{nextTitle}</span>
          </p>
        )}
      </div>

      <div className="space-y-3">
          {/* 1. Month */}
          <StepSection
            {...sp("month", 1)}
            title="Month and download"
            description="Pick the month, then start. The downloads, FX rates and summaries run on their own."
            summary={r ? `${r.doneTasks} of ${r.totalTasks} files verified · started ${when(r.createdAt)}` : undefined}
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
                  size={r ? "default" : "lg"}
                  className={cn(!r && "pulse-ring px-6")}
                  onClick={handleStart}
                  disabled={busy !== null || isPolling || restoring || !range}
                  variant={r ? "outline" : "default"}
                >
                  {busy === "start" ? <Loader2 className="animate-spin" /> : r ? <RotateCw /> : <Rocket />}
                  {r ? "Download again" : "Start close"}
                </Button>
              </div>
            </div>

            {!r && range && beforeMonthEnd(new Date().toISOString(), range.to) && (
              <Notice tone="warn" className="mt-4" title={`${monthLabel(month)} is not over yet`}>
                Xola will only have bookings up to today. For the month-end close, wait until {range.to} has passed.
              </Notice>
            )}
            {r && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {r.phase === "fetching_delegators" && "Getting the seller list from Xola…"}
                    {r.phase === "processing" && `Exporting ${r.totalTasks} files (${r.sellerCount} sellers × 3 reports)…`}
                    {r.phase === "done" &&
                      (r.status === "completed"
                        ? `All ${r.totalTasks} files downloaded and verified.`
                        : r.status === "completed_with_errors"
                          ? `${r.failedTasks} file(s) failed — retry them in step 2.`
                          : r.error || "The run failed.")}
                    {r.phase === "created" && "Starting…"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {when(r.createdAt)}
                    {r.createdBy && ` · ${r.createdBy}`}
                  </span>
                </div>
                <Progress value={pct} />
                {beforeMonthEnd(r.createdAt, r.to) && (
                  <Notice tone="warn" title={`Downloaded before ${monthLabel(r.month)} ended`}>
                    These files were exported on {when(r.createdAt)}, so the last days of the month are missing. Click
                    “Download again” now that the month is over.
                  </Notice>
                )}
                {running && !isPolling && (
                  <p className="text-xs text-muted-foreground">
                    Still downloading. Click “Resume watching” to follow it, or “Download again” to start over.
                  </p>
                )}
              </div>
            )}
          </StepSection>

          {/* 2. Downloads */}
          <StepSection
            {...sp("files", 2)}
            title="Check the downloads"
            description="Cash Flow, Payout and Recognized Earnings for every company — each file is checked automatically."
            summary={r ? `${r.doneTasks} verified${r.failedTasks ? ` · ${r.failedTasks} failed` : ""}` : undefined}
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
                    <span className="text-muted-foreground">Combined summaries (built automatically):</span>
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
            {...sp("fx", 3)}
            title="FX rates"
            description="Filled in automatically with the ECB rate for each payout date. Open the table only to change one."
            summary={r && r.fxRates.length ? `${r.fxRates.length} rate${r.fxRates.length === 1 ? "" : "s"} filled` : undefined}
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
            {r && r.fxRates.length > 0 && (
              <FxSummary run={r} open={fxOpen} onToggle={() => setFxOpen((v) => !v)} />
            )}
            {r && (fxOpen || r.fxRates.length === 0 || r.fxRates.some((x) => x.rate === null)) && (
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
            {...sp("xola", 4)}
            title="Build the Xola sales journal"
            description={
              viatorInXola
                ? "Built from each company's Transactions sheet. Unpaid office bookings are left out."
                : "Built from each company's Transactions sheet. Viator and unpaid office bookings are left out."
            }
            summary={jSummary(r?.journals.xola)}
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
                emptyHint={fxMissing ? `Enter the ${fxMissing} missing FX rate(s) in step 3 first — the build is blocked until they're in.` : "Click “Build XOLA” to create the journal and run the checks."}
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
                    <div className="space-y-3">
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
                    <SourceBreakdown locations={r.journals.xola.locations} />
                    </div>
                  )
                }
              />
            )}
          </StepSection>

          {/* 5. Deferred */}
          <StepSection
            {...sp("deferred", 5)}
            title="Build the deferred revenue journal"
            description="Cash Flow gross minus Recognized Earnings gross, posted per class."
            summary={jSummary(r?.journals.deferred)}
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
                        <Stat label="Cash Flow (gross)" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.cashFlowCents || 0), 0))} />
                        <Stat label="Recognized Earnings (gross)" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.recognizedCents || 0), 0))} />
                        <Stat label="Deferred" value={money(r.journals.deferred.figures.reduce((s, f) => s + (f.deferredCents || 0), 0))} />
                      </div>
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full min-w-[600px] text-sm">
                          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 font-medium">Location</th>
                              <th className="px-3 py-2 font-medium">Class</th>
                              <th className="px-3 py-2 text-right font-medium">Cash Flow gross</th>
                              <th className="px-3 py-2 text-right font-medium">Recognized gross</th>
                              <th className="px-3 py-2 text-right font-medium">Deferred</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.journals.deferred.figures.map((f) => (
                              <tr key={f.location} className="border-t">
                                <td className="px-3 py-2 font-medium">{f.location}</td>
                                <td className="px-3 py-2 text-muted-foreground">{f.class}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(f.cashFlowCents)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{money(f.recognizedCents)}</td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums">{money(f.deferredCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                }
              />
            )}
          </StepSection>

          {/* 6. Viator */}
          <StepSection
            {...sp("viator", 6)}
            title="Viator"
            description={
              viatorInXola
                ? "Already posted in the XOLA journal. Optionally upload each payment advice to check it."
                : "Upload one payment advice per entity. Posted at the net amount."
            }
            summary={jSummary(r?.journals.viator) ?? (skipViator ? "Optional — nothing to upload" : undefined)}
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
            {...sp("checks", 7)}
            title="Checks file"
            description="Every check result, the FX rates used and every accepted difference — for the close binder."
            summary={jSummary(r?.journals.checks)}
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
    </main>
  );
}
