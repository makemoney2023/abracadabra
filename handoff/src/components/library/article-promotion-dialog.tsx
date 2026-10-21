"use client";

import { useActionState } from "react";

const PLATFORMS = ["linkedin", "facebook", "instagram", "twitter", "threads", "tiktok", "youtube", "bluesky", "googlebusiness"] as const;
type PromotionState = { message: string };
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
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <h3 className="text-sm font-medium">Promote this article</h3>
      <p className="text-sm">This saves a draft in the client&apos;s review. It does not post.</p>
      <p className="text-sm">Article link</p>
      <p className="break-all text-sm">{canonicalUrl}</p>
      <p className="text-sm">Example draft link</p>
      <p className="break-all text-sm">{exampleOutbound}</p>
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="sourceItemId" value={sourceItemId} />
        <input type="hidden" name="sourceVersion" value={sourceVersion} />
        <input type="hidden" name="canonicalUrl" value={canonicalUrl} />
        {PLATFORMS.map((platform) => (
          <label key={platform} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="platforms" value={platform} defaultChecked={platform === "linkedin"} />
            {platform}
          </label>
        ))}
        <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" disabled={pending}>
          {pending ? "Saving…" : "Create draft"}
        </button>
      </form>
      <p role="status" aria-live="polite" className="text-sm">{state.message}</p>
    </section>
  );
}
