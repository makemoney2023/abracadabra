"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameClientAction } from "../actions";

/** Rename the company and, by default, its spaces that still show the old name. The space link (slug) stays. */
export function RenameForm({ organizationId, name }: { organizationId: string; name: string }) {
  return (
    <FormDrawer
      title="Rename"
      description="The new name shows across HQ. Space links stay the same. The change is noted on the timeline."
      trigger={<Button variant="outline">Rename</Button>}
    >
      <ActionForm action={renameClientAction} submitLabel="Rename" pendingLabel="Renaming">
        <input type="hidden" name="organizationId" value={organizationId} />
        <ActionField name="name" label="Company name">
          <Input name="name" required maxLength={200} defaultValue={name} />
        </ActionField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="renameSpaces" defaultChecked />
          Also rename spaces named &ldquo;{name}&rdquo;
        </label>
      </ActionForm>
    </FormDrawer>
  );
}
