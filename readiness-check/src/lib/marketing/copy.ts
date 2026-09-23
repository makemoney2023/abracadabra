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
  body: "Your overall score and top gaps are free. Enter a work email to unlock the page-by-page matrix, full findings, and PDF — the pages where the translation layer is missing. Fix packages above stay available without unlock.",
  button: "Unlock report",
  pending: "Unlocking…",
} as const;

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
    "Free AI-readiness check: see whether answer engines can confidently read your site. Score your structured data, discovery files, and page coverage — unlock the full report and PDF.",
} as const;
