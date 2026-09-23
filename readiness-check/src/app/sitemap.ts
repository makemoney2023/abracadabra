import type { MetadataRoute } from "next";
import { CHECK_GUIDES } from "@/content/check-guides";
import { checkUrl } from "@/lib/check-env";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = checkUrl();
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/check`, lastModified, changeFrequency: "weekly", priority: 1 },
    ...CHECK_GUIDES.map((guide) => ({
      url: `${base}/check/guide/${guide.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: guide.kind === "section" ? 0.8 : 0.5,
    })),
  ];
}
