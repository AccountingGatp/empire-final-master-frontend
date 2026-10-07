import type { Check } from "./api";

export function money(cents: number | null | undefined, currency = "") {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return "—";
  const n = cents / 100;
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = n < 0 ? `(${s})` : s;
  return currency ? `${signed} ${currency}` : signed;
}

export function dollars(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return money(Math.round(n * 100));
}

export function checkValue(v: Check["expected"], unit: Check["unit"]) {
  if (v === null || v === undefined) return "—";
  if (unit === "money" && typeof v === "number") return money(v);
  return String(v);
}

export function formatBytes(b: number) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function monthLabel(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  const last = new Date(year, mon, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${year}-${pad(mon)}-01`, to: `${year}-${pad(mon)}-${pad(last)}` };
}

// The calendar month before today, as 'YYYY-MM' (accounting closes last month).
export function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
