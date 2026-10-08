// Client for the Empire Express backend.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://empire-final-api.vercel.app";

export type TaskStatus =
  | "pending"
  | "exporting"
  | "polling"
  | "downloading"
  | "done"
  | "failed";

export type ReportType = "account" | "payout" | "earnings";

export type ReportCheck = { pass: boolean; found: string; message: string };

export type ViatorParsed = {
  parser: string;
  paymentDate: string;
  rowCount: number;
  currency: string;
  totalCents: number;
  warnings: string[];
  uploadedBy: string;
};

export type FileTask = {
  id: string;
  sellerId: string;
  sellerName: string;
  type: ReportType | "viator";
  status: TaskStatus;
  fileName: string | null;
  sizeBytes: number;
  attempts: number;
  error: string | null;
  reportCheck: ReportCheck | null;
  parsed: ViatorParsed | null;
  updatedAt: string;
};

export type SummaryStatus = "idle" | "generating" | "ready" | "failed";

export type SummaryPart = {
  status: SummaryStatus;
  fileName: string | null;
  sheetCount: number;
  skipped: number;
  error: string | null;
  generatedAt: string | null;
};

export type CheckUnit = "money" | "count" | "text";

export type Check = {
  id: string;
  location: string;
  name: string;
  expected: number | string | null;
  actual: number | string | null;
  diff: number | null;
  pass: boolean;
  unit: CheckUnit;
  note?: string;
  hardStop?: boolean;
};

export type JournalLine = {
  account: string;
  debit: number; // cents
  credit: number; // cents
  description: string;
  class: string;
  location: string;
};

export type JournalKey = "xola" | "deferred" | "viator";
export type FileKey = JournalKey | "office" | "checks";

export type Journal = {
  status: "idle" | "generating" | "ready" | "blocked" | "failed";
  journalNo: string | null;
  journalDate: string | null;
  fileName: string | null;
  lineCount: number;
  rowCount: number;
  totalDebit: number; // dollars
  totalCredit: number; // dollars
  balanced: boolean;
  warnings: string[];
  error: string | null;
  generatedAt: string | null;
  builtBy: string | null;
  stale: boolean;
  staleReason: string | null;
  checks: Check[];
  lines: JournalLine[];
  // XOLA: per-location build figures
  locations: {
    location: string;
    class: string;
    currency: string;
    rows: number;
    included: number;
    viatorRows: number;
    officeRows: number;
    clearingCents: number;
    grossUsdCents: number;
    bySource?: {
      source: string;
      rows: number;
      grossLocalCents: number;
      netLocalCents: number;
      netUsdCents: number | null;
      postedTo: string;
    }[];
  }[];
  // DEF / VIA: per-location figures
  figures: {
    location: string;
    class: string;
    cashFlowCents?: number;
    recognizedCents?: number;
    deferredCents?: number;
    currency?: string;
    adviceLocalCents?: number;
    adviceUsdCents?: number;
    files?: string[];
  }[];
  notPosted: { sellerName: string; reason: string }[];
  // DEF only: which reading of SOP 10.5 gives the known Deferred total.
  ruleTest?: RuleTest | null;
};

export type RuleVariant = {
  id: string;
  cashFlow: string;
  recognized: string;
  scope: string;
  totalCents: number;
  diffCents: number;
  approxRows: number;
};

export type RuleTest = {
  knownCents: number;
  current: string;
  variants: RuleVariant[];
  currentResult: RuleVariant | null;
  best: (RuleVariant & { locations: { location: string; cashFlowCents: number; recognizedCents: number; deferredCents: number }[] }) | null;
};

export type FxRate = {
  location: string;
  currency: string;
  date: string;
  label: string;
  rate: number | null;
  origin: "ecb" | "manual" | null;
  sources: string[];
  enteredBy: string | null;
  enteredAt: string | null;
};

export type AcceptedDiff = {
  journal: JournalKey;
  checkId: string;
  location: string;
  diff: number | null;
  unit: CheckUnit;
  reason: string;
  user: string;
  at: string;
};

export type Run = {
  id: string;
  month: string;
  from: string;
  to: string;
  phase: "created" | "fetching_delegators" | "processing" | "done";
  status: "running" | "completed" | "completed_with_errors" | "failed";
  totalTasks: number;
  doneTasks: number;
  failedTasks: number;
  sellerCount: number;
  error: string | null;
  createdAt: string;
  createdBy: string | null;
  account: FileTask[];
  payout: FileTask[];
  earnings: FileTask[];
  viator: FileTask[];
  companies: { missing: string[]; notPosted: { name: string; reason: string }[] };
  summaries: { account: SummaryPart; payout: SummaryPart };
  fxRates: FxRate[];
  fxScannedAt: string | null;
  acceptedDiffs: AcceptedDiff[];
  journals: Record<FileKey, Journal>;
};

export type Settings = {
  companies: { name: string; class: string; currency: string; optional: string | null }[];
  fxLimits: Record<string, { min: number; max: number; bankAccount: string }>;
  options: Record<string, unknown>;
  names: Record<string, string>;
  viatorAutoFetch: boolean;
};

export class ApiError extends Error {
  details: string[] | null;
  constructor(message: string, details: string[] | null = null) {
    super(message);
    this.details = details;
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) clearToken();
    throw new ApiError(body.error || `${res.status} ${res.statusText}`, body.details || null);
  }
  return res.json();
}

// Defaults so the UI never crashes on a backend that omits newer fields.
const emptySummary: SummaryPart = {
  status: "idle",
  fileName: null,
  sheetCount: 0,
  skipped: 0,
  error: null,
  generatedAt: null,
};

export const emptyJournal: Journal = {
  status: "idle",
  journalNo: null,
  journalDate: null,
  fileName: null,
  lineCount: 0,
  rowCount: 0,
  totalDebit: 0,
  totalCredit: 0,
  balanced: false,
  warnings: [],
  error: null,
  generatedAt: null,
  builtBy: null,
  stale: false,
  staleReason: null,
  checks: [],
  lines: [],
  locations: [],
  figures: [],
  notPosted: [],
};

function normalizeRun(r: Run): Run {
  const j = (r.journals || {}) as Partial<Record<FileKey, Journal>>;
  return {
    ...r,
    account: r.account ?? [],
    payout: r.payout ?? [],
    earnings: r.earnings ?? [],
    viator: r.viator ?? [],
    companies: r.companies ?? { missing: [], notPosted: [] },
    summaries: {
      account: r.summaries?.account ?? emptySummary,
      payout: r.summaries?.payout ?? emptySummary,
    },
    fxRates: r.fxRates ?? [],
    acceptedDiffs: r.acceptedDiffs ?? [],
    journals: {
      xola: { ...emptyJournal, ...j.xola },
      office: { ...emptyJournal, ...j.office },
      deferred: { ...emptyJournal, ...j.deferred },
      viator: { ...emptyJournal, ...j.viator },
      checks: { ...emptyJournal, ...j.checks },
    },
  };
}

async function runJson(res: Response): Promise<Run> {
  return normalizeRun(await json<Run>(res));
}

// ---- auth ----------------------------------------------------------------

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture: string;
};

const TOKEN_KEY = "empire_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token: string) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable */
  }
}
export function clearToken() {
  try {
    if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

// JSON headers + the Bearer token (if signed in).
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const post = (path: string, body?: unknown) =>
  fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });

// Exchange a Google ID token for a session (enforces the allowed domain server-side).
export async function loginWithGoogle(
  credential: string
): Promise<{ token: string; user: AuthUser }> {
  return json(
    await fetch(`${API_URL}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential }),
    })
  );
}

// Validate the stored session and return the current user.
export async function fetchMe(): Promise<{ user: AuthUser }> {
  return json(
    await fetch(`${API_URL}/api/auth/me`, { headers: authHeaders(), cache: "no-store" })
  );
}

// ---- runs + downloads ----------------------------------------------------------

export async function getSettings(): Promise<Settings> {
  return json(await fetch(`${API_URL}/api/settings`, { headers: authHeaders(), cache: "no-store" }));
}

export async function startRun(month: string): Promise<Run> {
  return runJson(await post(`/api/runs`, { month }));
}

export async function getRun(id: string): Promise<Run> {
  return runJson(
    await fetch(`${API_URL}/api/runs/${id}`, { headers: authHeaders(), cache: "no-store" })
  );
}

// The most recent run for a month (with its files), or null if none exists yet.
export async function getLatestRunForMonth(month: string): Promise<Run | null> {
  const res = await json<{ run: Run | null }>(
    await fetch(`${API_URL}/api/runs/latest?month=${encodeURIComponent(month)}`, {
      headers: authHeaders(),
      cache: "no-store",
    })
  );
  return res.run ? normalizeRun(res.run) : null;
}

export async function retryTask(
  id: string
): Promise<{ id: string; status: TaskStatus; error: string | null }> {
  return json(await post(`/api/tasks/${id}/retry`));
}

// Every download goes through the API with the session token, which answers
// with a short-lived link to the file in storage.
async function downloadVia(path: string, fallbackName: string) {
  const res = await fetch(`${API_URL}${path}${path.includes("?") ? "&" : "?"}json=1`, {
    headers: authHeaders({ Accept: "application/json" }),
    cache: "no-store",
  });
  const body = await json<{ url: string; fileName?: string }>(res);
  if (!body.url) throw new ApiError("The server did not return a download link.");
  const a = document.createElement("a");
  a.href = body.url;
  a.download = body.fileName || fallbackName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const downloadTask = (taskId: string, name: string) =>
  downloadVia(`/api/tasks/${taskId}/file`, name);
export const downloadSummary = (runId: string, type: "account" | "payout") =>
  downloadVia(`/api/runs/${runId}/summary/${type}/file`, `summary_${type}.xlsx`);
export const downloadJournal = (runId: string, key: FileKey, name: string) =>
  downloadVia(`/api/runs/${runId}/journals/${key}/file`, name);
export const downloadZip = (runId: string, month: string) =>
  downloadVia(`/api/runs/${runId}/files/zip`, `empire_${month}.zip`);

// Download one missing report type (e.g. Recognized Earnings) for every seller of
// an existing run, keeping its rates and accepted checks.
export async function addReport(runId: string, type: "earnings" = "earnings"): Promise<{ added: number; run: Run }> {
  const body = await json<{ added: number; run: Run }>(await post(`/api/runs/${runId}/add-report`, { type }));
  return { added: body.added, run: normalizeRun(body.run) };
}

export async function generateSummary(runId: string): Promise<Run> {
  return runJson(await post(`/api/runs/${runId}/summary`));
}

// ---- FX rates ------------------------------------------------------------------

export async function scanFx(runId: string): Promise<Run> {
  return runJson(await post(`/api/runs/${runId}/fx/scan`));
}

export async function saveFx(
  runId: string,
  rates: { location: string; currency: string; date: string; rate: number | null; origin?: string }[]
): Promise<Run> {
  return runJson(
    await fetch(`${API_URL}/api/runs/${runId}/fx`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ rates }),
    })
  );
}

// Free ECB market rates for every rate row (not saved; the user checks and saves).
export async function suggestFx(runId: string): Promise<{
  suggestions: { location: string; currency: string; date: string; rate: number; rateDate: string }[];
  problems: string[];
  source: string;
}> {
  return json(await post(`/api/runs/${runId}/fx/suggest`));
}

// ---- journals ------------------------------------------------------------------

export async function buildJournal(runId: string, key: JournalKey): Promise<Run> {
  return runJson(await post(`/api/runs/${runId}/journals/${key}/build`));
}

export async function acceptCheck(
  runId: string,
  key: JournalKey,
  body: { checkId: string; location: string; reason: string }
): Promise<Run> {
  return runJson(await post(`/api/runs/${runId}/journals/${key}/accept`, body));
}

export async function buildChecksFile(runId: string): Promise<Run> {
  return runJson(await post(`/api/runs/${runId}/checks-file`));
}

// ---- Viator --------------------------------------------------------------------

export async function uploadViator(runId: string, location: string, file: File): Promise<Run> {
  const qs = new URLSearchParams({ location, fileName: file.name });
  return runJson(
    await fetch(`${API_URL}/api/runs/${runId}/viator?${qs}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/octet-stream" }),
      body: file,
    })
  );
}

export async function deleteViator(runId: string, taskId: string): Promise<Run> {
  return runJson(
    await fetch(`${API_URL}/api/runs/${runId}/viator/${taskId}`, {
      method: "DELETE",
      headers: authHeaders(),
    })
  );
}
