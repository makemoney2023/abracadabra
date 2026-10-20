"use client";

import { useEffect, useState } from "react";
import type { FixOption } from "@/lib/fixes/generate-package";
import { buildGuidance, type PageGuidance as PageItem, type SiteGuidance } from "@/lib/fixes/guidance";
import { GUIDANCE_COPY } from "@/lib/marketing/copy";

/** Free, per-page remediation. Reads the free guidance endpoint; no files involved. */
export function PageGuidance({ token }: { token: string }) {
  const [site, setSite] = useState<SiteGuidance[] | null>(null);
  const [pages, setPages] = useState<PageItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scans/${token}/fixes`)
      .then(async (res) => {
        const data = (await res.json()) as { options?: FixOption[] };
        if (!res.ok || !Array.isArray(data.options)) throw new Error("guidance unavailable");
        if (cancelled) return;
        const g = buildGuidance(data.options);
        setSite(g.site);
        setPages(g.pages);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (failed) return null;

  return (
    <section id="page-guidance" className="space-y-5 animate-in fade-in duration-500">
      <div className="space-y-2">
        <p className="studio-kicker">{GUIDANCE_COPY.kicker}</p>
        <h3 className="font-heading text-2xl tracking-tight">{GUIDANCE_COPY.title}</h3>
        <p className="max-w-xl text-sm text-muted-foreground">{GUIDANCE_COPY.body}</p>
      </div>

      {pages === null ? (
        <p className="animate-pulse text-sm text-muted-foreground">{GUIDANCE_COPY.loading}</p>
      ) : (
        <>
          {site && site.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {GUIDANCE_COPY.siteTitle}
              </p>
              <ul className="space-y-2">
                {site.map((item) => (
                  <li key={item.id} className="studio-card flex gap-3 p-4 text-sm">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--sc-accent)]" />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {GUIDANCE_COPY.pagesTitle}
            </p>
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{GUIDANCE_COPY.empty}</p>
            ) : (
              <ul className="space-y-2">
                {pages.map((page) => (
                  <li key={page.url} className="studio-card min-w-0 space-y-1.5 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-all font-heading text-sm">{page.path}</span>
                      <span
                        className={
                          page.status === "partial"
                            ? "studio-pill studio-pill--progress"
                            : "studio-pill studio-pill--action"
                        }
                      >
                        {page.status === "partial" ? GUIDANCE_COPY.partial : GUIDANCE_COPY.missing}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">{page.pageType}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{page.needs}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
