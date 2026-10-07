"use client";

import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, MessageSquareText, OctagonX, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AcceptedDiff, Check, JournalKey } from "@/lib/api";
import { checkValue, when } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pill } from "./ui";

type Props = {
  journal: JournalKey;
  checks: Check[];
  accepted: AcceptedDiff[];
  onAccept: (check: Check, reason: string) => Promise<void>;
};

const keyOf = (c: { checkId?: string; id?: string; location: string }) => `${c.checkId ?? c.id}|${c.location}`;

export function ChecksTable({ journal, checks, accepted, onAccept }: Props) {
  const [showPassed, setShowPassed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const acceptedMap = useMemo(() => {
    const m = new Map<string, AcceptedDiff>();
    for (const a of accepted) if (a.journal === journal) m.set(keyOf(a), a);
    return m;
  }, [accepted, journal]);

  const acceptedFor = (c: Check) => {
    const a = acceptedMap.get(keyOf(c));
    if (!a || c.hardStop) return null;
    if (a.diff !== null && a.diff !== undefined && a.diff !== c.diff) return null; // data changed since
    return a;
  };

  const failed = checks.filter((c) => !c.pass && !acceptedFor(c));
  const acceptedChecks = checks.filter((c) => !c.pass && acceptedFor(c));
  const passed = checks.filter((c) => c.pass);
  const rows = [...failed, ...acceptedChecks, ...(showPassed ? passed : [])];

  async function submit(c: Check) {
    setSaving(true);
    setErr(null);
    try {
      await onAccept(c, reason);
      setOpen(null);
      setReason("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!checks.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Checks</span>
        <Pill tone="success">
          <CheckCircle2 className="size-3" /> {passed.length} passed
        </Pill>
        {failed.length > 0 && (
          <Pill tone="danger">
            <XCircle className="size-3" /> {failed.length} failed
          </Pill>
        )}
        {acceptedChecks.length > 0 && (
          <Pill tone="warn">
            <ShieldCheck className="size-3" /> {acceptedChecks.length} accepted
          </Pill>
        )}
        <button
          type="button"
          onClick={() => setShowPassed((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showPassed ? "Hide" : "Show"} passed checks
          <ChevronDown className={cn("size-3.5 transition", showPassed && "rotate-180")} />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          Every check passed. Use “Show passed checks” to see them.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Check</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 text-right font-medium">Expected</th>
                <th className="px-3 py-2 text-right font-medium">Actual</th>
                <th className="px-3 py-2 text-right font-medium">Diff</th>
                <th className="px-3 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const k = `${c.id}|${c.location}`;
                const acc = acceptedFor(c);
                const isOpen = open === k;
                return (
                  <Fragment key={k}>
                    <tr className={cn("border-t align-top", !c.pass && !acc && "bg-red-500/[0.04]")}>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <span className="mt-0.5 font-mono text-[0.7rem] text-muted-foreground">{c.id}</span>
                          <div className="min-w-0">
                            <p>{c.name}</p>
                            {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                            {acc && (
                              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                                Accepted by {acc.user} · {when(acc.at)} — “{acc.reason}”
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.location}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{checkValue(c.expected, c.unit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{checkValue(c.actual, c.unit)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.diff ? checkValue(c.diff, c.unit) : c.pass ? "—" : ""}
                      </td>
                      <td className="px-3 py-2">
                        {c.pass ? (
                          <Pill tone="success">Pass</Pill>
                        ) : c.hardStop ? (
                          <Pill tone="danger" title="A hard stop cannot be accepted — fix the data">
                            <OctagonX className="size-3" /> Hard stop
                          </Pill>
                        ) : acc ? (
                          <Pill tone="warn">Accepted</Pill>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            <Pill tone="danger">Fail</Pill>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-2 hover:underline"
                              onClick={() => {
                                setOpen(isOpen ? null : k);
                                setReason("");
                                setErr(null);
                              }}
                            >
                              <MessageSquareText className="size-3" /> Accept with reason
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t bg-muted/30">
                        <td colSpan={6} className="px-3 py-3">
                          <label className="text-xs font-medium" htmlFor={`reason-${k}`}>
                            Why is it OK to post with this difference? This is saved on the run with your name.
                          </label>
                          <textarea
                            id={`reason-${k}`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                            placeholder="e.g. Xola Summary rounds per booking — difference confirmed with the bank deposit"
                          />
                          {err && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{err}</p>}
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" disabled={saving || reason.trim().length < 5} onClick={() => submit(c)}>
                              {saving ? "Saving…" : "Accept difference"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
