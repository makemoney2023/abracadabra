"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { useFormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const ActionStateContext = React.createContext<ActionResult | null>(null);

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult> | ActionResult;

/**
 * Wraps a server action that returns ActionResult. Toasts the outcome,
 * shows the error, and asks the surrounding drawer to close on success.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving",
  onSuccess,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  onSuccess?: (result: Extract<ActionResult, { ok: true }>) => void;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const drawer = useFormDrawer();
  const seen = React.useRef<ActionResult | null>(null);

  React.useEffect(() => {
    if (!state || seen.current === state) return;
    seen.current = state;
    if (state.ok) {
      toast.success(state.message);
      onSuccess?.(state);
    } else {
      toast.error(state.error);
    }
    drawer?.report(state);
  }, [state, drawer, onSuccess]);

  const failure = state && !state.ok ? state : null;

  return (
    <ActionStateContext.Provider value={state}>
      <form action={formAction} data-slot="action-form" className={cn("flex flex-col gap-4", className)}>
        {children}
        {failure && !failure.field ? (
          <p role="alert" className="text-sm text-status-late">
            {failure.error}
          </p>
        ) : null}
        <ActionSubmit label={submitLabel} pendingLabel={pendingLabel} />
      </form>
    </ActionStateContext.Provider>
  );
}

/** Label, control, and the error for one named field. */
export function ActionField({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: React.ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>;
}) {
  const state = React.useContext(ActionStateContext);
  const error = state && !state.ok && state.field === name ? state.error : undefined;
  const id = React.useId();
  const errorId = `${id}-error`;
  const control = React.cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
  });

  return (
    <div data-slot="action-field" data-field={name} className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-status-late">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ActionSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="gap-2">
      {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
