/** What went wrong when a media model call threw. Safe to show an agent; never carries the provider's raw text. */
export type MediaFailure = {
  status: number;
  reason: "credits_exhausted" | "bad_input" | "rate_limited" | "model_error" | "empty_output";
  message: string;
  /** The HTTP status the provider sent, when one could be read. */
  upstreamStatus: number | null;
  /** A short, redacted line for server logs. */
  detail: string;
};

const PAYMENT = /payment required|insufficient (?:credit|fund|balance)|out of credit|credits? (?:exhausted|depleted)|no credits?|billing/i;

function numberOf(value: unknown): number | null {
  const parsed = typeof value === "string" && /^\d{3}$/.test(value) ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
}

function upstreamStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const response = record.response && typeof record.response === "object" ? (record.response as Record<string, unknown>) : null;
  return numberOf(record.status) ?? numberOf(record.statusCode) ?? numberOf(response?.status) ?? numberOf(record.code) ?? null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/** Keeps logs free of the prompt and of embedded images. */
export function redactDetail(raw: string, prompt: string): string {
  let text = raw;
  const needle = prompt.trim();
  if (needle.length >= 4) text = text.split(needle).join("[prompt]");
  text = text.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[data-uri]").replace(/[A-Za-z0-9+/=_-]{60,}/g, "[long-value]");
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function classifyMediaError(error: unknown, prompt = ""): MediaFailure {
  const upstream = upstreamStatus(error);
  const raw = messageOf(error);
  const detail = redactDetail(`${error instanceof Error ? error.name : typeof error}${raw ? `: ${raw}` : ""}`, prompt);
  const base = { upstreamStatus: upstream, detail };
  if (error instanceof Error && error.message === "empty") {
    return { ...base, status: 502, reason: "empty_output", message: "The model answered with no file (empty_output)." };
  }
  if (upstream === 402 || (upstream === null && /\b402\b/.test(raw)) || PAYMENT.test(raw)) {
    return { ...base, status: 402, reason: "credits_exhausted", message: "Model credits exhausted on the Cloudflare account." };
  }
  if (upstream === 429 || /rate.?limit|too many requests/i.test(raw)) {
    return { ...base, status: 502, reason: "rate_limited", message: "The model is rate limited right now (rate_limited). Try again shortly." };
  }
  if ((upstream !== null && upstream >= 400 && upstream < 500) || /\b4\d\d\b/.test(raw) || /invalid|unsupported|bad request|unknown/i.test(raw)) {
    return { ...base, status: 502, reason: "bad_input", message: "The model rejected the request (bad_input)." };
  }
  return { ...base, status: 502, reason: "model_error", message: "The model did not answer (model_error)." };
}
