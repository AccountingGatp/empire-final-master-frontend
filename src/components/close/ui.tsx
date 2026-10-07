"use client";

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Loader2, Lock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:text-red-300",
};

export function Pill({
  tone = "neutral",
  spin,
  children,
  className,
  title,
}: {
  tone?: Tone;
  spin?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className
      )}
    >
      {spin && <Loader2 className="size-3 animate-spin" />}
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Exclude<Tone, "neutral">;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "danger" ? AlertCircle : tone === "warn" ? AlertTriangle : tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={cn("flex gap-2.5 rounded-lg px-3 py-2.5 text-sm", toneClass[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-[0.8125rem] leading-relaxed whitespace-pre-line opacity-90">{children}</div>}
      </div>
    </div>
  );
}

export type StepState = "locked" | "todo" | "running" | "done" | "warn" | "blocked";

export function StepIcon({ state, n, className }: { state: StepState; n: number; className?: string }) {
  const base = "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (state === "done") return <span className={cn(base, "bg-emerald-600 text-white", className)}><CheckCircle2 className="size-4" /></span>;
  if (state === "blocked") return <span className={cn(base, "bg-red-600 text-white", className)}><XCircle className="size-4" /></span>;
  if (state === "warn") return <span className={cn(base, "bg-amber-500 text-white", className)}><AlertTriangle className="size-3.5" /></span>;
  if (state === "running") return <span className={cn(base, "bg-sky-600 text-white", className)}><Loader2 className="size-3.5 animate-spin" /></span>;
  if (state === "locked") return <span className={cn(base, "bg-muted text-muted-foreground", className)}><Lock className="size-3" /></span>;
  return <span className={cn(base, "bg-foreground text-background", className)}>{n}</span>;
}

export const stateLabel: Record<StepState, { text: string; tone: Tone }> = {
  locked: { text: "Waiting", tone: "neutral" },
  todo: { text: "To do", tone: "info" },
  running: { text: "Working", tone: "info" },
  done: { text: "Done", tone: "success" },
  warn: { text: "Needs attention", tone: "warn" },
  blocked: { text: "Blocked", tone: "danger" },
};

export function StepSection({
  id,
  n,
  title,
  description,
  state,
  lockedReason,
  actions,
  children,
}: {
  id: string;
  n: number;
  title: string;
  description: ReactNode;
  state: StepState;
  lockedReason?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const label = stateLabel[state];
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border bg-card shadow-xs">
      <header className="flex flex-wrap items-start gap-3 border-b px-4 py-4 sm:px-5">
        <StepIcon state={state} n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[0.95rem] font-semibold tracking-tight">
              <span className="text-muted-foreground">Step {n} · </span>
              {title}
            </h2>
            <Pill tone={label.tone} spin={state === "running"}>
              {label.text}
            </Pill>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions && state !== "locked" && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{actions}</div>}
      </header>
      <div className="px-4 py-4 sm:px-5">
        {state === "locked" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CircleDashed className="size-4" />
            {lockedReason || "Finish the steps above first."}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border bg-background px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          tone === "danger" && "text-red-700 dark:text-red-300",
          tone === "success" && "text-emerald-700 dark:text-emerald-300",
          tone === "warn" && "text-amber-700 dark:text-amber-300"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export const inputClass =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50";
