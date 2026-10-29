"use client";

import { BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// How to use this page — edit the text here when the SOP changes.
const STEPS: { title: string; text: string }[] = [
  {
    title: "Pick the month and press Start close",
    text: "The app downloads the Cash Flow, Payout and Recognized Earnings report for every company from Xola and checks each file. Nothing else to click while it runs.",
  },
  {
    title: "FX rates and combined summaries",
    text: "These happen by themselves once the downloads finish. Open FX rates only if a rate looks wrong or is missing.",
  },
  {
    title: "Build the Xola sales journal",
    text: "Made from the Cash Flow files. Viator sales that Xola also lists are left out here (their deferred revenue too) — Viator is entered from the Viator reports. The By Source table shows how many Viator sales were left out.",
  },
  {
    title: "Build the deferred revenue journal",
    text: "Cash Flow minus Recognized Earnings, posted per class.",
  },
  {
    title: "Viator journals (last)",
    text: "Download the Viator reports by hand for the six accounts: the bookings report by booking date, the bookings report by travel date, and the payment advices. Drop the zip in the Viator step (the product commission sheet is uploaded once). One build makes the sales & commission journal and the deferred journal, plus a workings file listing every booking and exception.",
  },
  {
    title: "Checks file",
    text: "Create it last. It records every check, the FX rates used and any difference someone accepted, for the close binder.",
  },
];

export function SopGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <BookOpen className="size-4 text-primary" /> How to use this page
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close guide">
          <X />
        </Button>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
