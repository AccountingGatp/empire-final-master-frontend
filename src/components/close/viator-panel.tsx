"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Run, Settings, ViatorPriceInfo } from "@/lib/api";
import { when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Notice, Pill } from "./ui";

const FALLBACK_ACCOUNTS = [
  { id: "5669845", label: "Chicago G&G", location: "", currency: "USD" },
  { id: "5538", label: "See It All", location: "", currency: "USD" },
  { id: "5669889", label: "Tours of NYC", location: "", currency: "USD" },
  { id: "5669870", label: "Washington DC", location: "", currency: "USD" },
  { id: "5669891", label: "Charleston", location: "", currency: "USD" },
  { id: "5669869", label: "London", location: "", currency: "GBP" },
];

type Result = { added: number; skipped: { fileName: string; reason: string }[] };

// Drop zone: the Viator files are downloaded by hand, so a person drops the
// whole "empire sales" zip (or the individual files) here.
function DropZone({
  accept,
  multiple,
  busy,
  idle,
  onFiles,
}: {
  accept: string;
  multiple?: boolean;
  busy: boolean;
  idle: string;
  onFiles: (files: File[]) => void;
}) {
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = [...(e.dataTransfer.files || [])];
        if (f.length) onFiles(multiple ? f : f.slice(0, 1));
      }}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm transition-colors",
        drag ? "border-primary bg-primary/5" : "border-input bg-background"
      )}
    >
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <FileUp className="size-4 shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 text-muted-foreground">{busy ? "Uploading…" : idle}</span>
      <button
        type="button"
        disabled={busy}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        onClick={() => ref.current?.click()}
      >
        Browse
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const f = [...(e.target.files || [])];
          if (f.length) onFiles(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

const Tick = ({ ok, label }: { ok: boolean; label?: string }) =>
  ok ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="size-4" />
      {label}
    </span>
  ) : (
    <span className="text-muted-foreground">—</span>
  );

export function ViatorPanel({
  run,
  settings,
  prices,
  onUploadFiles,
  onUploadPrices,
  onRemove,
}: {
  run: Run;
  settings: Settings | null;
  prices: ViatorPriceInfo | null;
  onUploadFiles: (file: File) => Promise<{ added: number; skipped: { fileName: string; reason: string }[] }>;
  onUploadPrices: (file: File) => Promise<void>;
  onRemove: (taskIds: string[]) => Promise<void>;
}) {
  const [busyFiles, setBusyFiles] = useState(false);
  const [busyPrices, setBusyPrices] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const accounts = settings?.viatorAccounts?.length ? settings.viatorAccounts : FALLBACK_ACCOUNTS;

  async function uploadMany(files: File[]) {
    setBusyFiles(true);
    setErr(null);
    const total: Result = { added: 0, skipped: [] };
    try {
      for (const f of files) {
        const r = await onUploadFiles(f);
        total.added += r.added;
        total.skipped.push(...r.skipped);
      }
      setResult(total);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyFiles(false);
    }
  }

  async function uploadPrices(files: File[]) {
    setBusyPrices(true);
    setErr(null);
    try {
      await onUploadPrices(files[0]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyPrices(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 1. product commission sheet */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Table2 className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">1 · Product commission sheet</p>
          {prices?.uploaded ? (
            <Pill tone="success">
              {prices.fileName} · {prices.rows} rows
            </Pill>
          ) : (
            <Pill tone="warn">needed — prices per adult / senior / youth / child</Pill>
          )}
        </div>
        {prices?.builtIn && (
          <p className="text-xs text-muted-foreground">
            Using the prices read from the Viator portal ({prices.rows} product / tour-grade rows, incl. group-size prices for private tours). Upload a sheet only if prices change.
          </p>
        )}
        {prices?.uploaded && !prices.builtIn && prices.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Uploaded by {prices.uploadedBy} · {when(prices.updatedAt)}. It is kept for every month — upload again only when prices change.
          </p>
        )}
        <DropZone
          accept=".xlsx,.xls,.csv"
          busy={busyPrices}
          idle={prices?.uploaded ? "Drop a newer sheet to replace it (xlsx or csv)" : "Drop the Viator product commission sheet (xlsx or csv)"}
          onFiles={uploadPrices}
        />
      </div>

      {/* 2. reports */}
      <div className="space-y-2">
        <p className="text-sm font-medium">2 · Viator reports for {run.month}</p>
        <DropZone
          accept=".zip,.csv,.xlsx,.xls"
          multiple
          busy={busyFiles}
          idle="Drop the zip (or the files): both bookings reports + payment advices for the six accounts"
          onFiles={uploadMany}
        />
        {err && <Notice tone="danger">{err}</Notice>}
        {result && (
          <Notice tone={result.skipped.length ? "warn" : "success"} title={`${result.added} file${result.added === 1 ? "" : "s"} added`}>
            {result.skipped.length > 0 &&
              result.skipped
                .slice(0, 6)
                .map((s) => `${s.fileName.split("/").pop()}: ${s.reason}`)
                .join("\n") + (result.skipped.length > 6 ? `\n…and ${result.skipped.length - 6} more not used` : "")}
          </Notice>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Booking-date report</th>
              <th className="px-3 py-2 font-medium">Travel-date report</th>
              <th className="px-3 py-2 text-right font-medium">Payment advices</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const files = run.viator.filter((t) => t.parsed?.account === a.id);
              const bk = files.filter((t) => t.parsed?.kind === "bookings");
              const hasBooking = bk.some((t) => t.parsed?.basis === "booking" || t.parsed?.basis === "both");
              const hasTravel = bk.some((t) => t.parsed?.basis === "travel" || t.parsed?.basis === "both");
              const empty = bk.filter((t) => t.parsed?.basis === "empty").length;
              const nBook = bk.filter((t) => t.parsed?.basis === "booking").reduce((n, t) => n + (t.parsed?.rowCount || 0), 0);
              const nTrav = bk.filter((t) => t.parsed?.basis === "travel").reduce((n, t) => n + (t.parsed?.rowCount || 0), 0);
              const pay = files.filter((t) => t.parsed?.kind === "payout");
              const warn = files.flatMap((t) => t.parsed?.warnings || []);
              return (
                <tr key={a.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium">{a.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.id} · {a.currency}
                    </p>
                    {warn.slice(0, 2).map((w) => (
                      <p key={w} className="text-xs text-amber-800 dark:text-amber-300">
                        {w}
                      </p>
                    ))}
                  </td>
                  <td className="px-3 py-2">
                    <Tick ok={hasBooking || empty > 0} label={hasBooking ? `${nBook} bookings` : "none this month"} />
                  </td>
                  <td className="px-3 py-2">
                    <Tick ok={hasTravel || empty > 0} label={hasTravel ? `${nTrav} bookings` : "none this month"} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{pay.length || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {files.length > 0 && (
                      <Button size="icon-sm" variant="ghost" title="Remove this account's files" onClick={() => onRemove(files.map((t) => t.id))}>
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
