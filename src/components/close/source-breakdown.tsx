"use client";

import { useState } from "react";
import type { Journal } from "@/lib/api";
import { money } from "@/lib/format";
import { inputClass } from "./ui";

// "By Source" for one location: the same split as Xola's Source / Channels
// filter on the Cash Flow export, and the clearing account each one goes to.
export function SourceBreakdown({ locations }: { locations: Journal["locations"] }) {
  const withData = locations.filter((l) => (l.bySource || []).length > 0);
  const [loc, setLoc] = useState(withData[0]?.location || "");
  const l = withData.find((x) => x.location === loc) || withData[0];
  if (!l) return null;
  const foreign = l.currency !== "USD";

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">By Source</p>
          <p className="text-xs text-muted-foreground">
            Compare with Xola: Reports › Analytics › Cash Flow, same dates, Source filter. Each clearing line in the journal equals
            its Source’s Net.
          </p>
        </div>
        <select className={inputClass + " w-auto"} value={l.location} onChange={(e) => setLoc(e.target.value)}>
          {withData.map((x) => (
            <option key={x.location} value={x.location}>
              {x.location}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 font-medium">Source (as in Xola)</th>
              <th className="px-2 py-1.5 text-right font-medium">Rows</th>
              <th className="px-2 py-1.5 text-right font-medium">Gross{foreign ? ` (${l.currency})` : ""}</th>
              <th className="px-2 py-1.5 text-right font-medium">Net{foreign ? ` (${l.currency})` : ""}</th>
              {foreign && <th className="px-2 py-1.5 text-right font-medium">Net (USD)</th>}
              <th className="px-2 py-1.5 font-medium">Goes to</th>
            </tr>
          </thead>
          <tbody>
            {(l.bySource || []).map((s) => (
              <tr key={s.source} className="border-t">
                <td className="px-2 py-1.5 font-medium">{s.source}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{s.rows}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(s.grossLocalCents)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(s.netLocalCents)}</td>
                {foreign && <td className="px-2 py-1.5 text-right tabular-nums">{s.netUsdCents === null ? "—" : money(s.netUsdCents)}</td>}
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{s.postedTo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
