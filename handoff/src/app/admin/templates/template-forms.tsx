"use client";

import { useActionState } from "react";
import { FILE_TAGS } from "@/lib/policy/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addTemplateItemAction,
  createTemplateAction,
  moveTemplateItemAction,
  retireTemplateAction,
  retireTemplateItemAction,
  type TemplateState,
} from "./actions";

const initial: TemplateState = { message: "" };

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function CreateTemplateForm() {
  const [state, action, pending] = useActionState(createTemplateAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="template-name">
        Template name
        <Input id="template-name" name="name" required maxLength={200} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Add template"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function AddItemForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(addTemplateItemAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={templateId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor={`item-title-${templateId}`}>
        Item
        <Input id={`item-title-${templateId}`} name="title" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`item-guidance-${templateId}`}>
        Guidance
        <Textarea
          id={`item-guidance-${templateId}`}
          name="guidance"
          maxLength={2000}
          rows={3}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`item-tag-${templateId}`}>
        Suggested tag
        <select id={`item-tag-${templateId}`} name="suggestedTag" className={selectClass} defaultValue="">
          <option value="">None</option>
          {FILE_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Add item"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function MoveItemForm({
  templateId,
  itemId,
  direction,
}: {
  templateId: string;
  itemId: string;
  direction: "up" | "down";
}) {
  const [state, action, pending] = useActionState(moveTemplateItemAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="direction" value={direction} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {direction === "up" ? "Move up" : "Move down"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function RetireItemForm({ templateId, itemId }: { templateId: string; itemId: string }) {
  const [state, action, pending] = useActionState(retireTemplateItemAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Retiring" : "Retire item"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function RetireTemplateForm({ templateId }: { templateId: string }) {
  const [state, action, pending] = useActionState(retireTemplateAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="templateId" value={templateId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Retiring" : "Retire template"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
