"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { setParentAction } from "../actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** "Set parent": put this company under a holding company, move it, or take it out of its group. */
export function SetParentForm({
  organizationId,
  parentId,
  choices,
  headsGroup,
  label = "Set parent",
  size = "default",
}: {
  organizationId: string;
  parentId: string | null;
  choices: { id: string; name: string }[];
  headsGroup: boolean;
  label?: string;
  size?: "default" | "sm";
}) {
  return (
    <FormDrawer
      title="Set parent company"
      description="Group this company under a holding company. Each company keeps its own spaces, projects and agents."
      trigger={
        <Button variant="outline" size={size}>
          {label}
        </Button>
      }
    >
      {headsGroup ? (
        <p className="text-sm text-muted-foreground">
          This company heads a group, so it cannot sit under another one. Groups are one level deep.
        </p>
      ) : (
        <ActionForm action={setParentAction} submitLabel="Save" pendingLabel="Saving">
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="previousParentId" value={parentId ?? ""} />
          <ActionField name="parentOrganizationId" label="Part of">
            <select name="parentOrganizationId" className={selectClass} defaultValue={parentId ?? ""}>
              <option value="">None (not in a group)</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.name}
                </option>
              ))}
            </select>
          </ActionField>
        </ActionForm>
      )}
    </FormDrawer>
  );
}
