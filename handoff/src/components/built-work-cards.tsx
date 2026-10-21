import { ArrowUpRight, Code2, Eye, Globe } from "lucide-react";

import { displayHost, type BuiltWorkCard } from "@/lib/built-work";

const STATUS_TONE: Record<BuiltWorkCard["status"], string> = {
  live: "bg-phosphor text-canvas",
  preview: "bg-optic text-canvas",
  in_progress: "bg-status-waiting text-status-waiting-fg",
  archived: "bg-status-neutral text-status-neutral-fg",
};

const VISIBILITY_LABEL: Record<BuiltWorkCard["visibility"], string | null> = {
  client: null,
  held: "Held for Client Services review",
  hidden: "Retired: hidden from client",
};

function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function Action({ href, label, icon, primary = false }: { href: string; label: string; icon: React.ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={
        primary
          ? "inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          : "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm hover:border-optic hover:text-optic"
      }
    >
      {icon}
      <span>{label}</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
      <span className="sr-only">(opens in new tab)</span>
    </a>
  );
}

function Shot({ card, host }: { card: BuiltWorkCard; host: string | null }) {
  if (card.screenshotFileId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/${card.screenshotFileId}/preview`}
        alt={`Screenshot of ${card.title}`}
        loading="lazy"
        decoding="async"
        className="size-full object-cover object-top transition-transform duration-500 group-hover/built:scale-[1.02]"
      />
    );
  }
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(141,235,242,0.18),transparent_60%),radial-gradient(90%_80%_at_100%_100%,rgba(198,255,179,0.12),transparent_55%)]">
      <Globe aria-hidden="true" className="size-8 text-optic/80" />
      {host ? <span className="font-mono text-xs text-muted-foreground">{host}</span> : null}
    </div>
  );
}

/**
 * Websites and other things we built, as cards: screenshot, status, title, host, a short description and the live,
 * preview and repo links. Clients see only approved items; staff also see held and retired ones, with who filed them.
 */
export function BuiltWorkCards({
  cards,
  viewer,
  heading = "What we built",
  intro,
  showSpace = false,
}: {
  cards: BuiltWorkCard[];
  viewer: "client" | "staff";
  heading?: string;
  intro?: string;
  showSpace?: boolean;
}) {
  if (cards.length === 0) return null;
  return (
    <section data-slot="built-work" data-viewer={viewer} aria-labelledby="built-work-heading" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="eyebrow text-xs text-optic">{cards.length === 1 ? "1 project" : `${cards.length} projects`}</p>
        <h2 id="built-work-heading" className="font-heading text-2xl leading-tight">{heading}</h2>
        {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => {
          const live = safeHttps(card.liveUrl);
          const preview = safeHttps(card.previewUrl);
          const repo = safeHttps(card.repoUrl);
          const host = displayHost(live ?? preview);
          const primary = live ?? preview;
          const note = viewer === "staff" ? VISIBILITY_LABEL[card.visibility] : null;
          return (
            <li
              key={card.id}
              data-slot="built-work-card"
              data-visibility={card.visibility}
              className={`group/built flex flex-col overflow-hidden rounded-2xl border bg-card ${card.visibility === "hidden" ? "border-dashed border-border opacity-70" : "border-border"}`}
            >
              <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-muted/40">
                {primary ? (
                  <a href={primary} target="_blank" rel="noopener noreferrer" className="block size-full" tabIndex={-1} aria-hidden="true">
                    <Shot card={card} host={host} />
                  </a>
                ) : (
                  <Shot card={card} host={host} />
                )}
                <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm ${STATUS_TONE[card.status]}`}>
                  {card.status === "live" ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
                  {card.statusLabel}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-lg leading-snug text-balance">{card.title}</h3>
                  {host ? <p className="font-mono text-xs text-muted-foreground">{host}</p> : null}
                </div>
                {card.description ? <p className="text-sm leading-6 text-muted-foreground">{card.description}</p> : null}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {live ? <Action href={live} label="Visit site" icon={<Globe aria-hidden="true" className="size-4" />} primary /> : null}
                  {preview ? <Action href={preview} label="Preview" icon={<Eye aria-hidden="true" className="size-4" />} primary={!live} /> : null}
                  {repo ? <Action href={repo} label="Code" icon={<Code2 aria-hidden="true" className="size-4" />} /> : null}
                </div>
                {viewer === "staff" ? (
                  <p className="flex flex-wrap gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                    {note ? <span className="font-medium text-foreground">{note}</span> : <span>Client can see this</span>}
                    {card.agentLabel ? <span>· {card.agentLabel}</span> : null}
                    {showSpace ? <span>· {card.spaceName}</span> : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
