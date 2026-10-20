"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TokenResult } from "./actions";

/** A caw_ token shown once, with a copy button. It lives only in this component's state. */
export function TokenReveal({ token, agentId }: { token: string; agentId: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">Token for {agentId}</p>
      <p className="text-xs text-muted-foreground">
        Shown once. Hand it to Client Services for this agent. HQ keeps only a hash, so a lost token means rotating.
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly value={token} aria-label="Agent token" className="font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(
              () => {
                setCopied(true);
                toast.success("Token copied.");
              },
              () => toast.error("Copy failed. Select the token and copy it."),
            );
          }}
        >
          {copied ? <CheckIcon className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="gap-2">
      {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Like ActionForm, but stays open on success so the one-time token can be copied. */
export function TokenActionForm({
  action,
  children,
  submitLabel,
  pendingLabel,
}: {
  action: (state: TokenResult | null, formData: FormData) => Promise<TokenResult>;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const seen = React.useRef<TokenResult | null>(null);
  React.useEffect(() => {
    if (!state || seen.current === state) return;
    seen.current = state;
    if (state.ok) toast.success(state.message);
    else toast.error(state.error);
  }, [state]);
  if (state?.ok && state.token && state.agentId) {
    return <TokenReveal token={state.token} agentId={state.agentId} />;
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-status-late">
          {state.error}
        </p>
      ) : null}
      <Submit label={submitLabel} pendingLabel={pendingLabel} />
    </form>
  );
}
