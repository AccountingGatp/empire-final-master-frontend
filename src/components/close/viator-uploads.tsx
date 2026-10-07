"use client";

import { useRef, useState } from "react";
import { Download, FileUp, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileTask, Run, Settings } from "@/lib/api";
import { money, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Notice, Pill, inputClass } from "./ui";

export function ViatorUploads({
  run,
  settings,
  onUpload,
  onDelete,
  onDownload,
}: {
  run: Run;
  settings: Settings | null;
  onUpload: (location: string, file: File) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onDownload: (t: FileTask) => void;
}) {
  const [location, setLocation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const companies = settings?.companies || [];

  async function upload() {
    if (!file || !location) return;
    setBusy(true);
    setErr(null);
    try {
      await onUpload(location, file);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-end">
        <div className="space-y-1">
          <label htmlFor="viator-location" className="text-xs font-medium">
            Location (entity)
          </label>
          <select
            id="viator-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={cn(inputClass, "w-full")}
          >
            <option value="">Choose…</option>
            {companies.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} · {c.currency}
              </option>
            ))}
          </select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className={cn(
            "flex h-9 items-center gap-2 rounded-lg border border-dashed px-3 text-sm",
            drag ? "border-sky-500 bg-sky-500/5" : "border-input"
          )}
        >
          <FileUp className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {file ? file.name : "Drop the payment advice here (CSV or XLSX)"}
          </span>
          <button type="button" className="shrink-0 text-xs font-medium underline-offset-2 hover:underline" onClick={() => inputRef.current?.click()}>
            Browse
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <Button onClick={upload} disabled={!file || !location || busy}>
          <Upload /> {busy ? "Uploading…" : "Upload"}
        </Button>
      </div>
      {err && <Notice tone="danger">{err}</Notice>}

      {run.viator.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No advices uploaded yet. Upload one file per Viator entity for {run.month}.
          {settings && !settings.viatorAutoFetch && " (Automatic download from Viator comes later.)"}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 text-right font-medium">Bookings</th>
                <th className="px-3 py-2 text-right font-medium">Net total</th>
                <th className="px-3 py-2 font-medium">Payment date</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {run.viator.map((t) => (
                <tr key={t.id} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{t.sellerName}</td>
                  <td className="px-3 py-2">
                    <p className="max-w-[16rem] truncate">{t.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.parsed?.uploadedBy} · {when(t.updatedAt)}
                    </p>
                    {t.parsed?.warnings?.map((w) => (
                      <p key={w} className="text-xs text-amber-800 dark:text-amber-300">
                        {w}
                      </p>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.parsed?.rowCount ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(t.parsed?.totalCents, t.parsed?.currency)}</td>
                  <td className="px-3 py-2">{t.parsed?.paymentDate || <Pill tone="warn">none — rate by hand</Pill>}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" title="Download" onClick={() => onDownload(t)}>
                        <Download />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title="Remove" onClick={() => onDelete(t.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
