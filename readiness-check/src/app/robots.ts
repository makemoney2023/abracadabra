import type { MetadataRoute } from "next";
import { checkUrl } from "@/lib/check-env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${checkUrl()}/sitemap.xml`,
  };
}
