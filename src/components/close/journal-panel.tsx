"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcceptedDiff, Check, FileKey, Journal, JournalKey } from "@/lib/api";
import { dollars, money, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChecksTable } from "./checks-table";
import { Notice, Stat } from "./ui";

export function journalGate(j: Journal): { ok: boolean; why: string } {
  if (j.status === "idle" || !j.generatedAt) return { ok: false, why: "Build it first." };
  if (j.status === "failed") return { ok: false, why: "The last build failed — see the message above." };
  if (j.status === "generating") return { ok: false, why: "Building…" };
  if (j.stale) return { ok: false, why: `Out of date: ${j.staleReason}. Build it again.` };
  if (j.status === "blocked") return { ok: false, why: "A check failed. Fix the data or accept the difference with a reason." };
  return { ok: true, why: "" };
}

export function JournalPanel({
  journalKey,
  journal,
  accepted,
  onAccept,
  onDownload,
  extraDownloads = [],
  figures,
  emptyHint,
}: {
  journalKey: JournalKey;
  journal: Journal;
  accepted: AcceptedDiff[];
  onAccept: (check: Check, reason: string) => Promise<void>;
  onDownload: (key: FileKey, name: string) => void;
  extraDownloads?: { key: FileKey; label: string; name: string; enabled: boolean; hint?: string }[];
  figures?: ReactNode;
  emptyHint: string;
}) {
  const [showLines, setShowLines] = useState(false);
  const built = !!journal.generatedAt && journal.status !== "idle";
  const gate = journalGate(journal);

  return (
    <div className="space-y-4">
      {journal.status === "failed" && journal.error && (
        <Notice tone="danger" title="The build was stopped">
          {journal.error}
        </Notice>
      )}
      {journal.stale && (
        <Notice tone="warn" title="Out of date">
          {journal.staleReason}. Build again before downloading.
        </Notice>
      )}

      {!built && journal.status !== "failed" && <p className="text-sm text-muted-foreground">{emptyHint}</p>}

      {built && journal.status !== "failed" && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Journal" value={journal.journalNo || "—"} sub={journal.journalDate ? `dated ${journal.journalDate}` : undefined} />
            <Stat label="Lines" value={journal.lineCount} sub={journal.builtBy ? `built ${when(journal.generatedAt)}` : undefined} />
            <Stat label="Debits" value={dollars(journal.totalDebit)} tone={journal.balanced ? "success" : "danger"} sub={journal.balanced ? "balanced" : "NOT balanced"} />
            <Stat label="Credits" value={dollars(journal.totalCredit)} tone={journal.balanced ? "success" : "danger"} />
          </div>

          {figures}

          <ChecksTable journal={journalKey} checks={journal.checks} accepted={accepted} onAccept={onAccept} />

          {journal.lines.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowLines((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {showLines ? "Hide" : "Preview"} journal lines ({journal.lines.length})
                <ChevronDown className={cn("size-3.5 transition", showLines && "rotate-180")} />
              </button>
              {showLines && (
                <div className="mt-2 max-h-96 overflow-auto rounded-xl border">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Account</th>
                        <th className="px-2 py-1.5 text-right font-medium">Debit</th>
                        <th className="px-2 py-1.5 text-right font-medium">Credit</th>
                        <th className="px-2 py-1.5 font-medium">Description</th>
                        <th className="px-2 py-1.5 font-medium">Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.lines.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1.5">{l.account}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.debit ? money(l.debit) : ""}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{l.credit ? money(l.credit) : ""}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{l.description}</td>
                          <td className="px-2 py-1.5">{l.class}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {journal.notPosted.length > 0 && (
            <Notice tone="info" title="Not posted">
              {journal.notPosted.map((n) => `${n.sellerName}: ${n.reason}`).join("\n")}
            </Notice>
          )}
        </>
      )}

      {built && journal.status !== "failed" && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button disabled={!gate.ok} onClick={() => onDownload(journalKey, journal.fileName || `${journal.journalNo}.xlsx`)}>
            {gate.ok ? <Download /> : <Lock />} Download {journal.journalNo}
          </Button>
          {extraDownloads.map((d) => (
            <Button key={d.key} variant="outline" disabled={!d.enabled} onClick={() => onDownload(d.key, d.name)} title={d.hint}>
              <Download /> {d.label}
            </Button>
          ))}
          {!gate.ok && <span className="text-sm text-muted-foreground">{gate.why}</span>}
        </div>
      )}
    </div>
  );
}
