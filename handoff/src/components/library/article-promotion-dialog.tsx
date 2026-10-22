"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { LIBRARY_PLATFORMS } from "./library-view";

type PromotionState = { message: string; href?: string };
const initial: PromotionState = { message: "" };

export function promotionPreviewUrls(canonicalUrl: string, platforms: string[]): { label: string; url: string }[] {
  return platforms.flatMap((platform) => {
    const option = LIBRARY_PLATFORMS.find((entry) => entry.id === platform);
    if (!option) return [];
    const url = new URL(canonicalUrl);
    url.searchParams.set("utm_source", platform);
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", "article");
    return [{ label: option.label, url: url.toString() }];
  });
}

export function ArticlePromotionDialog({
  sourceItemId,
  sourceVersion,
  canonicalUrl,
  media,
  targets,
  action,
}: {
  sourceItemId: string;
  sourceVersion: number;
  canonicalUrl: string;
  media: { key: string; role: string; contentType: string; previewSrc: string | null }[];
  targets: { id: string; title: string }[];
  action: (previous: PromotionState, formData: FormData) => Promise<PromotionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [campaignId] = useState(() => crypto.randomUUID());
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const previews = promotionPreviewUrls(canonicalUrl, platforms);

  function togglePlatform(platform: string, checked: boolean) {
    setPlatforms((current) => checked
      ? [...new Set([...current, platform])]
      : current.filter((entry) => entry !== platform));
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-medium">Promote this article</h3>
      <p className="text-sm">This saves a draft in the client&apos;s review. It does not post.</p>
      <p className="text-sm">Article link</p>
      <p className="break-all text-sm">{canonicalUrl}</p>
      <div className="rounded-xl bg-muted/40 p-3">
        <p className="text-sm font-medium">Links that will be added</p>
        {previews.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {previews.map((preview) => (
              <li key={preview.label}>
                <span className="font-medium">{preview.label}</span>
                <span className="block break-all text-muted-foreground">{preview.url}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-muted-foreground">Choose at least one network.</p>}
      </div>
      <form action={formAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="sourceItemId" value={sourceItemId} />
        <input type="hidden" name="sourceVersion" value={sourceVersion} />
        <input type="hidden" name="canonicalUrl" value={canonicalUrl} />
        <input type="hidden" name="externalId" value={campaignId} />
        <input type="hidden" name="mediaSelectionPresented" value="1" />
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Save into
          <select name="targetDeliverableId" className="min-h-11 rounded-md border border-border bg-background px-3">
            <option value="">A new social draft</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}
          </select>
        </label>
        {media.length > 0 ? (
          <fieldset className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
            <legend className="text-sm font-medium">Media to include</legend>
            {media.map((item) => (
              <label key={item.key} className="flex min-h-11 items-center gap-3 rounded-md border border-border p-2 text-sm">
                <input type="checkbox" name="selectedMediaKeys" value={item.key} defaultChecked />
                {item.previewSrc ? <Image src={item.previewSrc} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded object-cover" /> : null}
                <span>{item.role} · {item.contentType}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {LIBRARY_PLATFORMS.map((platform) => (
          <label key={platform.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm">
            <input
              type="checkbox"
              name="platforms"
              value={platform.id}
              checked={platforms.includes(platform.id)}
              onChange={(event) => togglePlatform(platform.id, event.target.checked)}
            />
            {platform.label}
          </label>
        ))}
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3 text-sm text-primary-foreground sm:col-span-2" disabled={pending || platforms.length === 0}>
          {pending ? "Saving…" : "Create draft"}
        </button>
      </form>
      <p role="status" aria-live="polite" className="text-sm">{state.message}</p>
      {state.href ? <a className="inline-flex min-h-11 items-center text-sm underline" href={state.href}>Open the draft</a> : null}
    </section>
  );
}
