"use client";

import { useState } from "react";
import type { RuleTest } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Notice } from "./ui";

// "Which reading of SOP 10.5 gives the known Deferred total?"
// Built by the backend (deferredRules.js) for months with a known total.
export function RuleTestPanel({ test }: { test: RuleTest }) {
  const [open, setOpen] = useState(false);
  const best = test.best;
  // Within a dollar = a match (rates are ECB, not yet the banked Wise rates).
  const matched = best && Math.abs(best.diffCents) <= 100;
  const isCurrent = best && best.id === test.current;

  return (
    <div className="space-y-2">
      <Notice
        tone={matched ? (isCurrent ? "success" : "warn") : "info"}
        title={`Which rule gives the known total ${money(test.knownCents)}?`}
      >
        {best && matched && isCurrent && <>The current settings already give it (difference {money(best.diffCents)}).</>}
        {best && matched && !isCurrent && (
          <>
            <b>Found it:</b> Cash Flow = {best.cashFlow}; Recognized = {best.recognized}; {best.scope} →{" "}
            {money(best.totalCents)} (difference {money(best.diffCents)}). The app currently uses rule {test.current}
            {test.currentResult ? ` (${money(test.currentResult.totalCents)})` : ""}. Tell the developer to switch to rule {best.id}.
          </>
        )}
        {best && !matched && (
          <>
            No reading of the SOP gives the known total exactly — the closest is rule {best.id} ({money(best.totalCents)},
            difference {money(best.diffCents)}). The working sheet used something the Xola files don’t show; ask for the
            “Empire Clearing Acc Working” sheet, Deferred Revenue tab.
          </>
        )}
      </Notice>

      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setOpen(!open)}>
        {open ? "Hide" : "Show"} every rule tried
      </button>

      {open && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Rule</th>
                  <th className="px-3 py-2 font-medium">Cash Flow</th>
                  <th className="px-3 py-2 font-medium">Recognized</th>
                  <th className="px-3 py-2 text-right font-medium">Deferred</th>
                  <th className="px-3 py-2 text-right font-medium">vs known</th>
                </tr>
              </thead>
              <tbody>
                {test.variants.map((v) => (
                  <tr key={v.id} className={cn("border-t", v.id === test.current && "bg-muted/40")}>
                    <td className="px-3 py-2 font-medium">
                      {v.id}
                      {v.id === test.current && <span className="ml-1 text-xs text-muted-foreground">(now)</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{v.cashFlow}</td>
                    <td className="px-3 py-2 text-xs">
                      {v.recognized}
                      {v.scope !== "SOP companies" && <span className="text-muted-foreground"> · {v.scope}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(v.totalCents)}</td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        Math.abs(v.diffCents) <= 100 ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"
                      )}
                    >
                      {money(v.diffCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {best && (
            <div className="overflow-x-auto rounded-xl border">
              <p className="px-3 pt-2 text-xs text-muted-foreground">Closest rule ({best.id}) by location</p>
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 text-right font-medium">Cash Flow</th>
                    <th className="px-3 py-2 text-right font-medium">Recognized</th>
                    <th className="px-3 py-2 text-right font-medium">Deferred</th>
                  </tr>
                </thead>
                <tbody>
                  {best.locations.map((l) => (
                    <tr key={l.location} className="border-t">
                      <td className="px-3 py-2">{l.location}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(l.cashFlowCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(l.recognizedCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(l.deferredCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
