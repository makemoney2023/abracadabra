import { classifyPageType } from "@/lib/prioritize-urls";

export type ReclassifyInput = {
  url: string;
  origin: string;
  currentType: string;
  html?: string;
  markdown?: string;
  title?: string;
};

/**
 * Content-assisted page type bump when URL classifier left the page as `other`
 * (or weak blog/other). Pure heuristics — no LLM.
 */
export function reclassifyPageType(input: ReclassifyInput): string {
  const fromUrl = classifyPageType(input.url, input.origin);
  if (fromUrl !== "other") return fromUrl;

  const blob = [input.title, input.html, input.markdown].filter(Boolean).join("\n").toLowerCase();
  if (!blob) return input.currentType || "other";

  if (/testimonial|success stor|what our (clients|patients|customers) say/.test(blob)) {
    return "testimonial";
  }
  if (/\breviews?\b/.test(blob) && /customer|patient|client/.test(blob)) {
    return "testimonial";
  }
  if (/book (an )?appointment|schedule (a )?visit|request an appointment|book now/.test(blob)) {
    return "appointment";
  }
  if (/property=["']og:type["'][^>]*content=["']article["']|content=["']article["'][^>]*property=["']og:type["']/.test(blob)) {
    return "blogPost";
  }
  if (/<time[^>]*datetime=/.test(blob) && /<article\b/.test(blob)) {
    return "blogPost";
  }
  if (/\b(upcoming events?|event details|register for)\b/.test(blob)) {
    return "event";
  }
  if (/\b(we'?re hiring|job opening|apply now|careers?)\b/.test(blob)) {
    return "careers";
  }
  if (/\b(menu|appetizer|entree|entrée)\b/.test(blob) && /\b(food|restaurant|dinner|lunch)\b/.test(blob)) {
    return "menu";
  }

  return input.currentType || "other";
}
