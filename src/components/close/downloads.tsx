"use client";

import { useMemo, useState } from "react";
import { Download, FileCheck2, FileWarning, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileTask, ReportType, Run } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Notice, Pill } from "./ui";

const COLUMNS: { type: ReportType; label: string; marker: string }[] = [
  { type: "account", label: "Cash Flow", marker: "Report Details must show “Date is between”" },
  { type: "payout", label: "Payout", marker: "Report Details must show “From Date / To Date / Payout Lag”" },
  { type: "earnings", label: "Recognized Earnings", marker: "Report Details must show “Recognized Earnings Report”" },
];

const working: Record<string, string> = {
  pending: "Queued",
  exporting: "Requesting",
  polling: "Generating",
  downloading: "Downloading",
};

function Cell({
  task,
  onRetry,
  onDownload,
}: {
  task?: FileTask;
  onRetry: (id: string) => void;
  onDownload: (t: FileTask) => void;
}) {
  if (!task) return <span className="text-xs text-muted-foreground">—</span>;
  if (task.status in working) {
    return (
      <Pill tone="info" spin>
        {working[task.status]}
      </Pill>
    );
  }
  if (task.status === "done") {
    return (
      <div className="flex items-center gap-1.5">
        <Pill tone="success" title={task.reportCheck?.message || "verified"}>
          <FileCheck2 className="size-3" /> Verified
        </Pill>
        <Button size="icon-xs" variant="ghost" title={`Download · ${formatBytes(task.sizeBytes)}`} onClick={() => onDownload(task)}>
          <Download />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        <Pill tone="danger" title={task.error || ""}>
          <FileWarning className="size-3" /> Failed
        </Pill>
        <Button size="xs" variant="outline" onClick={() => onRetry(task.id)}>
          <RotateCw /> Retry
        </Button>
      </div>
      {task.error && <p className="max-w-[16rem] text-[0.7rem] leading-snug text-red-700 dark:text-red-300">{task.error}</p>}
    </div>
  );
}

export function DownloadsMatrix({
  run,
  onRetry,
  onDownload,
}: {
  run: Run;
  onRetry: (id: string) => void;
  onDownload: (t: FileTask) => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(false);

  const sellers = useMemo(() => {
    const names = new Set<string>();
    for (const c of COLUMNS) for (const t of run[c.type]) names.add(t.sellerName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [run]);

  const find = (type: ReportType, seller: string) => run[type].find((t) => t.sellerName === seller);
  const notPosted = new Map(run.companies.notPosted.map((n) => [n.name, n.reason]));

  const visible = onlyProblems
    ? sellers.filter((s) => COLUMNS.some((c) => find(c.type, s)?.status === "failed"))
    : sellers;

  return (
    <div className="space-y-3">
      {run.companies.missing.length > 0 && (
        <Notice tone="warn" title={`${run.companies.missing.length} expected compan${run.companies.missing.length === 1 ? "y is" : "ies are"} missing from Xola`}>
          {run.companies.missing.join(", ")}. Check the seller list in Xola — the journal checks will fail for these.
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {COLUMNS.map((c) => {
          const tasks = run[c.type];
          const ok = tasks.filter((t) => t.status === "done").length;
          const bad = tasks.filter((t) => t.status === "failed").length;
          return (
            <div key={c.type} className="rounded-xl border bg-background px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{c.label}</p>
                <span className="text-sm tabular-nums">
                  <span className={cn(bad ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300")}>{ok}</span>
                  <span className="text-muted-foreground"> / {tasks.length}</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{c.marker}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Every file is opened after download and its Report Details sheet checked against the report type and month.
        </p>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
          Only problems
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              {COLUMNS.map((c) => (
                <th key={c.type} className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s} className="border-t align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">{s}</p>
                  {notPosted.has(s) && <p className="text-xs text-muted-foreground">{notPosted.get(s)}</p>}
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.type} className="px-3 py-2">
                    <Cell task={find(c.type, s)} onRetry={onRetry} onDownload={onDownload} />
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {sellers.length ? "No problems — every file verified." : (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Waiting for the seller list…
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
