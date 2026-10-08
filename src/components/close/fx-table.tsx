"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FxRate, Run, Settings } from "@/lib/api";
import { when } from "@/lib/format";
import { suggestFx } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Notice, Pill, inputClass } from "./ui";

const key = (r: { location: string; currency: string; date: string }) => `${r.location}|${r.currency}|${r.date}`;

export function rateError(currency: string, value: string, limits: Settings["fxLimits"]) {
  if (value.trim() === "") return "Required";
  const n = Number(value);
  const lim = limits[currency];
  if (!Number.isFinite(n)) return "Not a number";
  if (!lim) return `No limits set for ${currency}`;
  if (n < lim.min || n > lim.max) return `Must be ${lim.min}–${lim.max}`;
  return null;
}

export function FxTable({
  run,
  settings,
  onSave,
}: {
  run: Run;
  settings: Settings | null;
  onSave: (rates: { location: string; currency: string; date: string; rate: number | null; origin: string }[]) => Promise<void>;
}) {
  const limits = settings?.fxLimits || {};
  // The parent remounts this component (via `key`) whenever the stored table
  // changes, so the draft always starts from what's saved.
  const stored = useMemo(() => Object.fromEntries(run.fxRates.map((r) => [key(r), r.rate === null ? "" : String(r.rate)])), [run.fxRates]);
  const [draft, setDraft] = useState<Record<string, string>>(stored);
  const [saving, setSaving] = useState(false);
  // ECB suggestions shown next to each row: key -> { rate, rateDate }.
  const [ecb, setEcb] = useState<Record<string, { rate: number; rateDate: string }>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<{ tone: "info" | "warn" | "danger"; text: string } | null>(null);

  // A row counts as "ECB" when its value is exactly the suggested rate (typed
  // over = manual). Saved ECB rows keep that label.
  const originOf = (r: FxRate): "ecb" | "manual" => {
    const v = (draft[key(r)] ?? "").trim();
    const s = ecb[key(r)];
    if (s && v !== "" && Number(v) === s.rate) return "ecb";
    if (!s && r.origin === "ecb" && v === (stored[key(r)] ?? "")) return "ecb";
    return "manual";
  };

  async function suggest(overwrite: boolean) {
    setSuggesting(true);
    setSuggestMsg(null);
    try {
      const res = await suggestFx(run.id);
      const map: Record<string, { rate: number; rateDate: string }> = {};
      for (const sgn of res.suggestions) map[key(sgn)] = { rate: sgn.rate, rateDate: sgn.rateDate };
      setEcb(map);
      setDraft((d) => {
        const next = { ...d };
        for (const r of run.fxRates) {
          const sgn = map[key(r)];
          if (sgn && (overwrite || !(next[key(r)] ?? "").trim())) next[key(r)] = String(sgn.rate);
        }
        return next;
      });
      setSuggestMsg(
        res.problems.length
          ? { tone: "warn", text: `Filled ${res.suggestions.length} rows. Not found: ${res.problems.join("; ")}` }
          : { tone: "info", text: `Filled ${res.suggestions.length} rows with the ECB market rate for each payout date. Check each against the Wise deposit, then click “Save rates” at the bottom.` }
      );
    } catch (e) {
      setSuggestMsg({ tone: "danger", text: `Could not get ECB rates: ${(e as Error).message}` });
    } finally {
      setSuggesting(false);
    }
  }

  const dirty = run.fxRates.some((r) => (draft[key(r)] ?? "") !== (stored[key(r)] ?? ""));
  const errors = run.fxRates.map((r) => rateError(r.currency, draft[key(r)] ?? "", limits));
  const missing = errors.filter(Boolean).length;

  async function save() {
    setSaving(true);
    try {
      await onSave(
        run.fxRates.map((r) => {
          const v = (draft[key(r)] ?? "").trim();
          return { location: r.location, currency: r.currency, date: r.date, rate: v === "" ? null : Number(v), origin: originOf(r) };
        })
      );
    } finally {
      setSaving(false);
    }
  }

  if (!run.fxRates.length) {
    return (
      <Notice tone="success" title="No GBP or EUR rows need a rate">
        {run.fxScannedAt ? `Checked ${when(run.fxScannedAt)}.` : "Click “Find rates needed” once the downloads have finished."}
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Rates are USD per 1 unit, filled automatically with the ECB rate for each payout date. To use a different rate — the
        banked Wise rate from QBO, or an average — type it in (or use “Same rate for many dates”) and click Save rates. Limits:{" "}
        {Object.entries(limits)
          .map(([cur, l]) => `${cur}: ${l.bankAccount}, ${l.min}–${l.max}`)
          .join(" · ")}
        .
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2.5">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Free ECB market rates</span> (European Central Bank, via frankfurter.dev) —
          a starting point only. The SOP needs the banked Wise rate, so compare each row with the deposit before saving.
        </div>
        <Button size="sm" variant="outline" disabled={suggesting} onClick={() => suggest(false)}>
          {suggesting ? "Getting rates…" : "Suggest for empty rows"}
        </Button>
        <Button size="sm" variant="ghost" disabled={suggesting} onClick={() => suggest(true)}>
          Replace all with ECB
        </Button>
      </div>
      {suggestMsg && <Notice tone={suggestMsg.tone}>{suggestMsg.text}</Notice>}

      <QuickFill
        currencies={[...new Set(run.fxRates.map((r) => r.currency))]}
        limits={limits}
        onFill={(currency, value, overwrite) =>
          setDraft((d) => {
            const next = { ...d };
            for (const r of run.fxRates) {
              if (r.currency !== currency) continue;
              if (overwrite || !(next[key(r)] ?? "").trim()) next[key(r)] = value;
            }
            return next;
          })
        }
      />

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Currency</th>
              <th className="px-3 py-2 font-medium">Payout date</th>
              <th className="px-3 py-2 font-medium">Rate</th>
              <th className="px-3 py-2 font-medium">Used by</th>
            </tr>
          </thead>
          <tbody>
            {run.fxRates.map((r: FxRate, i) => {
              const k = key(r);
              const err = errors[i];
              const touched = (draft[k] ?? "") !== "";
              return (
                <tr key={k} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">{r.location}</td>
                  <td className="px-3 py-2">{r.currency}</td>
                  <td className="px-3 py-2">
                    {r.date || (
                      <span className="text-amber-800 dark:text-amber-300" title="Rows with no Payout Date need a rate entered by hand">
                        {r.label || "No payout date"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      aria-label={`${r.currency} rate for ${r.location} ${r.date}`}
                      value={draft[k] ?? ""}
                      placeholder={limits[r.currency] ? `${limits[r.currency].min}–${limits[r.currency].max}` : ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      className={cn(inputClass, "w-32 tabular-nums", err && touched && "border-red-500 focus-visible:ring-red-500/30")}
                    />
                    {err && touched && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{err}</p>}
                    {originOf(r) === "ecb" && (
                      <p className="mt-1 text-[0.7rem] text-sky-700 dark:text-sky-300">
                        ECB rate{ecb[k] ? ` of ${ecb[k].rateDate}` : " (automatic)"}
                      </p>
                    )}
                    {r.enteredBy && !dirty && <p className="mt-1 text-[0.7rem] text-muted-foreground">by {r.enteredBy}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.sources.map((s) => (
                        <Pill key={s}>{s === "xola" ? "XOLA" : s === "earnings" ? "DEF" : "VIA"}</Pill>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center gap-3",
          dirty && "sticky bottom-3 z-10 rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5 shadow-sm dark:bg-amber-950"
        )}
      >
        <Button onClick={save} disabled={!dirty || saving}>
          <Save /> {saving ? "Saving…" : "Save rates"}
        </Button>
        <span className={cn("text-sm", dirty ? "font-medium text-amber-900 dark:text-amber-200" : "text-muted-foreground")}>
          {dirty
            ? missing === 0
              ? "Not saved yet — click “Save rates”. The journals only use saved rates."
              : `Not saved yet, and ${missing} rate${missing === 1 ? "" : "s"} still needed.`
            : missing === 0
              ? "All rates saved and within limits."
              : `${missing} rate${missing === 1 ? "" : "s"} still needed — the journals can't be built until every rate is in.`}
        </span>
      </div>
    </div>
  );
}

// Put one rate into every GBP (or EUR) row at once — handy when the banked rate
// is the same for several payout dates. Only fills the draft; nothing is saved
// until "Save rates", and single rows can still be changed afterwards.
function QuickFill({
  currencies,
  limits,
  onFill,
}: {
  currencies: string[];
  limits: Settings["fxLimits"];
  onFill: (currency: string, value: string, overwrite: boolean) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (!currencies.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-muted/30 px-3 py-2.5">
      <p className="w-full text-xs text-muted-foreground">
        Same rate for many dates? Type it once and fill the rows, then correct any date that differs.
      </p>
      {currencies.map((cur) => {
        const v = values[cur] ?? "";
        const err = v ? rateError(cur, v, limits) : null;
        return (
          <div key={cur} className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor={`fill-${cur}`}>
                {cur} rate
              </label>
              <input
                id={`fill-${cur}`}
                inputMode="decimal"
                value={v}
                placeholder={limits[cur] ? `${limits[cur].min}–${limits[cur].max}` : ""}
                onChange={(e) => setValues((x) => ({ ...x, [cur]: e.target.value }))}
                className={cn(inputClass, "w-28 tabular-nums", err && "border-red-500")}
              />
            </div>
            <Button size="sm" variant="outline" disabled={!v || !!err} onClick={() => onFill(cur, v.trim(), false)}>
              Fill empty {cur} rows
            </Button>
            <Button size="sm" variant="ghost" disabled={!v || !!err} onClick={() => onFill(cur, v.trim(), true)}>
              Replace all
            </Button>
            {err && <span className="text-xs text-red-700 dark:text-red-300">{err}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Compact view of step 3 (shown by default): how many rates, where they came
// from, and a button to open the full table for anyone who wants other rates.
export function FxSummary({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  const total = run.fxRates.length;
  const empty = run.fxRates.filter((r) => r.rate === null).length;
  const ecb = run.fxRates.filter((r) => r.rate !== null && r.origin === "ecb").length;
  const manual = total - empty - ecb;
  const byCur = [...new Set(run.fxRates.map((r) => r.currency))]
    .map((c) => {
      const rs = run.fxRates.filter((r) => r.currency === c && r.rate !== null).map((r) => Number(r.rate));
      if (!rs.length) return `${c}: —`;
      const min = Math.min(...rs);
      const max = Math.max(...rs);
      return `${c} ${min === max ? min : `${min}–${max}`}`;
    })
    .join(" · ");
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2.5">
      <div className="min-w-0 text-sm">
        {empty === 0 ? (
          <p className="font-medium">
            All {total} rates filled{ecb ? ` — ${ecb} automatic (ECB)` : ""}
            {manual ? `${ecb ? "," : " —"} ${manual} entered by hand` : ""}.
          </p>
        ) : (
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {empty} of {total} rates still empty — the ECB rate could not be fetched for them. Fill them in below.
          </p>
        )}
        <p className="text-xs text-muted-foreground">{byCur}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onToggle}>
        {open ? "Hide rates" : "View / change rates"}
      </Button>
    </div>
  );
}
