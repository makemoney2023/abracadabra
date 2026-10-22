"use client";

import { useActionState, useState } from "react";
import { LIBRARY_PLATFORMS } from "./library-view";

type PromotionState = { message: string; href?: string };
const initial: PromotionState = { message: "" };

export function ArticlePromotionDialog({
  sourceItemId,
  sourceVersion,
  canonicalUrl,
  exampleOutbound,
  action,
}: {
  sourceItemId: string;
  sourceVersion: number;
  canonicalUrl: string;
  exampleOutbound: string;
  action: (previous: PromotionState, formData: FormData) => Promise<PromotionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [campaignId] = useState(() => crypto.randomUUID());
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-medium">Promote this article</h3>
      <p className="text-sm">This saves a draft in the client&apos;s review. It does not post.</p>
      <p className="text-sm">Article link</p>
      <p className="break-all text-sm">{canonicalUrl}</p>
      <p className="text-sm">Example draft link</p>
      <p className="break-all text-sm">{exampleOutbound}</p>
      <p className="text-sm text-muted-foreground">The example uses LinkedIn tracking. Each selected network gets its own tracked link.</p>
      <form action={formAction} className="grid gap-2 sm:grid-cols-2">
        <input type="hidden" name="sourceItemId" value={sourceItemId} />
        <input type="hidden" name="sourceVersion" value={sourceVersion} />
        <input type="hidden" name="canonicalUrl" value={canonicalUrl} />
        <input type="hidden" name="externalId" value={campaignId} />
        {LIBRARY_PLATFORMS.map((platform) => (
          <label key={platform.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm">
            <input type="checkbox" name="platforms" value={platform.id} defaultChecked={platform.id === "linkedin"} />
            {platform.label}
          </label>
        ))}
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3 text-sm text-primary-foreground sm:col-span-2" disabled={pending}>
          {pending ? "Saving…" : "Create draft"}
        </button>
      </form>
      <p role="status" aria-live="polite" className="text-sm">{state.message}</p>
      {state.href ? <a className="inline-flex min-h-11 items-center text-sm underline" href={state.href}>Open the draft</a> : null}
    </section>
  );
}
