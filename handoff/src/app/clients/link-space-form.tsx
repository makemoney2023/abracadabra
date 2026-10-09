"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { linkSpaceAction } from "./actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function LinkSpaceForm({
  organizationId,
  spaces,
  label = "Link space",
}: {
  organizationId: string;
  spaces: { id: string; display_name: string; slug: string }[];
  label?: string;
}) {
  return (
    <FormDrawer
      title="Link a space"
      description="A file space for this client."
      trigger={
        <Button variant="outline" size={label === "Link a space" ? "sm" : "default"}>
          {label}
        </Button>
      }
    >
      {spaces.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every space is already linked.</p>
      ) : (
        <ActionForm action={linkSpaceAction} submitLabel="Link a space" pendingLabel="Linking">
          <input type="hidden" name="organizationId" value={organizationId} />
          <ActionField name="workspaceId" label="Space">
            <select name="workspaceId" required className={selectClass} defaultValue={spaces[0]?.id ?? ""}>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.display_name} ({space.slug})
                </option>
              ))}
            </select>
          </ActionField>
        </ActionForm>
      )}
    </FormDrawer>
  );
}
