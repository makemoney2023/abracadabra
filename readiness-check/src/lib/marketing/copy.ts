/** Canonical public marketing copy — AI Blind Spot positioning. */

export const SCAN_CTA = "Check your AI visibility";

export const LANDING_COPY = {
  brand: "Schema",
  eyebrow: "AI readiness",
  heroSubhead:
    "See whether ChatGPT, Perplexity, and Gemini can confidently read your site — or if you’re stuck in an AI blind spot.",
  problemTitle: "Still optimizing for blue links?",
  problemBody:
    "Customers are asking AI engines for recommendations. Those engines don’t browse like humans — they look for a machine-readable translation layer. Without it, they guess. Guessing means they cite a competitor who made the facts easy to trust.",
  analogyTitle: "Hand AI a business card, not a brochure",
  analogyBody:
    "Humans can read your pages fine. AI looks for a hidden translation layer — structured facts about your business, services, location, and FAQs. Missing that layer is like handing ChatGPT a 10-page brochure and asking it to find your phone number. Install it, and you’ve handed over a perfectly formatted business card.",
  howTitle: "How it works",
  steps: [
    {
      title: "Paste your URL",
      body: "We map priority pages and site files — no account required.",
    },
    {
      title: "Get your AI visibility score",
      body: "Structured data, discovery files, crawlability, coverage, and answer readiness — in one score.",
    },
    {
      title: "See the gaps — then fix them",
      body: "Unlock the page matrix and PDF, download fix packages, or ask us to close the blind spot.",
    },
  ] as const,
  faqs: [
    {
      q: "We already pay an SEO agency for this.",
      a: "Most traditional SEO still optimizes for keywords and backlinks. AI retrieval is different. Run your URL through Schema — if the score and page matrix show blank structured data, you’re flying blind in the AI era.",
    },
    {
      q: "Will this break my website?",
      a: "No. The translation layer is invisible to human visitors. It won’t change a pixel of your design or slow your site down.",
    },
    {
      q: "Does this guarantee ChatGPT will recommend me?",
      a: "No one can guarantee an AI output. Schema removes the friction that keeps engines from citing you — certainty over guesswork.",
    },
  ] as const,
  finalTitle: "Find your AI blind spot",
  finalBody: "Free score in minutes. Unlock page-level detail when you’re ready.",
} as const;

export const UNLOCK_COPY = {
  title: "See which pages AI can’t read",
  body: "Your score, every issue, and what each page needs are free. Enter a work email to unlock the page-by-page matrix and the PDF.",
  button: "Unlock report",
  pending: "Unlocking…",
} as const;

/** Per-page fixes, always free. */
export const GUIDANCE_COPY = {
  kicker: "What to fix",
  title: "What each page needs",
  body: "Every page we read, and what to add so AI assistants understand it. This is yours, free.",
  siteTitle: "Across your site",
  pagesTitle: "Page by page",
  partial: "Partly there",
  missing: "Missing",
  empty: "Every page we read already tells AI assistants what it is.",
  loading: "Working out what each page needs…",
} as const;

/** Paid file download. Amounts come from config only (PRICE_*, CREDIT_AMOUNT_CENTS). */
export const PAYWALL_COPY = {
  kicker: "Your fix files",
  lockedTitle: "Get the files that fix it",
  lockedBody:
    "Everything above stays free. The files are those fixes, written for your pages and ready to install. Buy once for this scan and download as often as you need.",
  buy: "Buy the files",
  redirecting: "Opening checkout…",
  unavailableBody:
    "File downloads open soon. Your score, issues, and page-by-page fixes stay free.",
  unavailableButton: "Not on sale yet",
  confirming: "Confirming your purchase…",
  cancelled: "No charge made. Buy whenever you’re ready.",
  paidPill: "Paid",
  paidTitle: "Your files are ready",
  paidBody: "Choose what to include, then download. Come back to this link any time.",
  download: "Download your files",
  downloadData: "Download as data",
  checkoutError: "Checkout didn’t open. Try again in a minute.",
  confirmError: "We couldn’t confirm that payment yet. Reload in a minute — if you were charged, your files will be here.",
} as const;

export function buyLabel(priceDisplay: string | null | undefined): string {
  return priceDisplay ? `${PAYWALL_COPY.buy} ${priceDisplay}` : PAYWALL_COPY.buy;
}

/** "$10 credit applied at checkout, you pay $89.99" — only when both amounts are configured. */
export function creditLine(
  creditDisplay: string | null | undefined,
  payDisplay: string | null | undefined,
): string | null {
  if (!creditDisplay || !payDisplay) return null;
  return `${creditDisplay} credit applied at checkout, you pay ${payDisplay}`;
}

export const OPT_IN_COPY = {
  title: "Want us to close the AI blind spot?",
  body: "Opt in and we’ll follow up about an AI-readiness upgrade for this domain — invisible to visitors, usually done in days, not a redesign.",
  button: "Request follow-up",
  pending: "Submitting…",
  doneTitle: "You’re on the list",
  doneBody: "We’ll follow up with prioritized fixes so AI engines can read this domain with confidence.",
} as const;

export const SCORE_PREVIEW_COPY = {
  label: "AI visibility score",
  previewHint: "Preview — unlock for page matrix & PDF",
} as const;

export const META_COPY = {
  title: "Schema — AI visibility for your website",
  description:
    "See whether answer engines can confidently read your site. Score your structured data, discovery files, and page coverage — unlock the full report and PDF.",
} as const;

/** Metadata for the Readiness Check pages, including a visitor's results (/check/[token]). Matches the results view: scores, stage and next steps; never "free", never a fixed tip count. */
export const READINESS_META_COPY = {
  title: "Your Readiness Check",
  description:
    "A five-to-seven-minute check that gives your business scores, a stage name, and next steps for where it is today, plus a thirty-minute working session if you want one.",
} as const;
