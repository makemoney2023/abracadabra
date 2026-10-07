"use client";

import { useActionState } from "react";
import { DELIVERABLE_KINDS, ITEM_FORMATS } from "@/lib/deliverable-manifest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addDeliverableItemAction,
  createDeliverableAction,
  publishDeliverableAction,
  pullDeliverableAction,
  type FormState,
} from "./actions";
import { DELIVERABLE_KIND_LABEL, ITEM_FORMAT_LABEL } from "./labels";

const initial: FormState = { message: "" };
const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

function Status({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function CreateDeliverableForm({
  organizationId,
  projectId,
  spaces,
}: {
  organizationId: string;
  projectId: string;
  spaces: { id: string; displayName: string }[];
}) {
  const [state, action, pending] = useActionState(createDeliverableAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="projectId" value={projectId} />
      <Input name="title" required maxLength={200} placeholder="Name" aria-label="Name" />
      <select name="kind" className={selectClass} defaultValue="social_pack" aria-label="Kind">
        {DELIVERABLE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {DELIVERABLE_KIND_LABEL[kind]}
          </option>
        ))}
      </select>
      <select name="workspaceId" className={selectClass} required aria-label="Space">
        {spaces.map((space) => (
          <option key={space.id} value={space.id}>
            {space.displayName}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add finished work"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function AddItemForm({ deliverableId }: { deliverableId: string }) {
  const [state, action, pending] = useActionState(addDeliverableItemAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <Input name="title" required maxLength={200} placeholder="Piece name" aria-label="Piece name" />
      <select name="format" className={selectClass} defaultValue="static" aria-label="Format">
        {ITEM_FORMATS.map((format) => (
          <option key={format} value={format}>
            {ITEM_FORMAT_LABEL[format]}
          </option>
        ))}
      </select>
      <Input name="section" maxLength={80} placeholder="Section" aria-label="Section" />
      <Input name="channel" maxLength={80} placeholder="Channel" aria-label="Channel" />
      <Textarea name="copy" maxLength={4000} placeholder="Words on the piece" aria-label="Words" />
      <Input name="link" maxLength={500} placeholder="Link" aria-label="Link" />
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add a piece"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function PublishForm({ deliverableId }: { deliverableId: string }) {
  const [state, action, pending] = useActionState(publishDeliverableAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send to the client"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function PullForm({
  deliverableId,
  repos,
}: {
  deliverableId: string;
  repos: { id: string; fullName: string; branch: string }[];
}) {
  const [state, action, pending] = useActionState(pullDeliverableAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <select name="repoId" className={selectClass} required aria-label="Repo">
        {repos.map((repo) => (
          <option key={repo.id} value={repo.id}>
            {repo.fullName}
          </option>
        ))}
      </select>
      <Input name="path" required placeholder="deliverables/social-preview/manifest.json" aria-label="Manifest path" />
      <Input name="ref" placeholder={repos[0]?.branch || "main"} aria-label="Branch or commit" />
      <Button type="submit" disabled={pending}>
        {pending ? "Pulling…" : "Pull from the repo"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}
