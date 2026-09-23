import type { Metadata } from "next";
import { checkUrl } from "@/lib/check-env";

export function checkCanonical(path: string): string {
  const base = checkUrl();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function checkPageMetadata(input: { title: string; description: string; path: string }): Metadata {
  const canonical = checkCanonical(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical },
    openGraph: { title: input.title, description: input.description, url: canonical },
    robots: { index: true, follow: true },
  };
}
