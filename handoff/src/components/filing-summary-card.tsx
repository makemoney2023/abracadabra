import { ArrowUpRight, ChevronRight, FileStack } from "lucide-react";

import { Markdown } from "@/components/markdown";
import { clientDetails, clientLead, deliveredLabel, type FilingSummary } from "@/lib/filing-summary";

function safeHttp(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Expander({ label, openLabel, children, tone = "default" }: {
  label: string;
  openLabel: string;
  children: React.ReactNode;
  tone?: "default" | "staff";
}) {
  return (
    <details className="group/details border-t border-border pt-4" data-slot={tone === "staff" ? "staff-details" : "client-details"}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground hover:text-optic [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open/details:rotate-90" />
        <span className="group-open/details:hidden">{label}</span>
        <span className="hidden group-open/details:inline">{openLabel}</span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

/**
 * The top of a finished piece an agent filed. Clients get a clean card: title, Delivered date (Toronto time), the
 * short summary, links, and the long content behind "Show details". The Files list is left out because the files
 * are listed right below. Staff also get "Details for staff" with the agent, card and reference ids.
 */
export function FilingSummaryCard({
  summary,
  viewer,
  raw,
  fileLinks,
  fileCount,
}: {
  summary: FilingSummary;
  viewer: "client" | "staff";
  /** The stored page text. Staff only. */
  raw?: string;
  fileLinks?: Record<string, string>;
  /** Files of this filing shown below the card. */
  fileCount?: number;
}) {
  const lead = clientLead(summary);
  const details = clientDetails(summary);
  const links = summary.links.flatMap((link) => {
    const href = safeHttp(link.url);
    return href ? [{ label: link.label, href }] : [];
  });
  const count = fileCount ?? summary.files.length;
  return (
    <section
      data-slot="filing-summary"
      data-viewer={viewer}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-card px-4 py-5 sm:px-7 sm:py-7"
    >
      <header className="flex flex-col gap-2">
        {summary.finishedAt ? (
          <p className="font-mono text-xs tracking-wide text-optic">
            Delivered <time dateTime={summary.finishedAt.toISOString()}>{deliveredLabel(summary.finishedAt)}</time>
          </p>
        ) : (
          <p className="font-mono text-xs tracking-wide text-optic">Delivered</p>
        )}
        <h2 className="font-heading text-xl leading-snug text-balance sm:text-2xl">{summary.title}</h2>
      </header>
      {lead ? (
        <Markdown variant="prose" images={false} fileLinks={fileLinks} className="text-base leading-7">
          {lead}
        </Markdown>
      ) : null}
      {links.length > 0 || count > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <a
              key={`${link.href}-${link.label}`}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm hover:border-optic hover:text-optic"
            >
              <span className="truncate">{link.label}</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only">opens in new tab</span>
            </a>
          ))}
          {count > 0 ? (
            <span className="inline-flex min-h-9 items-center gap-1.5 px-1 text-sm text-muted-foreground">
              <FileStack aria-hidden="true" className="size-4" />
              {count === 1 ? "1 file below" : `${count} files below`}
            </span>
          ) : null}
        </div>
      ) : null}
      {details ? (
        <Expander label="Show details" openLabel="Hide details">
          <Markdown variant="prose" images={false} fileLinks={fileLinks}>
            {details}
          </Markdown>
        </Expander>
      ) : null}
      {viewer === "staff" ? (
        <Expander label="Details for staff" openLabel="Hide staff details" tone="staff">
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-muted-foreground">Clients don&apos;t see this part.</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              {summary.meta.map((entry) => (
                <div key={entry.key} className="contents">
                  <dt className="text-muted-foreground">{entry.key}</dt>
                  <dd className="min-w-0 font-mono text-xs leading-6 [overflow-wrap:anywhere]">{entry.value}</dd>
                </div>
              ))}
            </dl>
            {summary.handoff ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">Handoff note</p>
                <Markdown>{summary.handoff}</Markdown>
              </div>
            ) : null}
            {summary.files.length ? (
              <div className="flex flex-col gap-1">
                <p className="font-medium">Files in the filing</p>
                <p className="font-mono text-xs leading-6 text-muted-foreground [overflow-wrap:anywhere]">{summary.files.join(", ")}</p>
              </div>
            ) : null}
            {raw ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs [overflow-wrap:anywhere]">
                {raw}
              </pre>
            ) : null}
          </div>
        </Expander>
      ) : null}
    </section>
  );
}
