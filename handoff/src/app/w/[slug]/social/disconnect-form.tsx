"use client";

import { ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { disconnectFromSpaceAction } from "./actions";

export function DisconnectFromSpaceForm({ slug, accountId }: { slug: string; accountId: string }) {
  return (
    <FormDrawer
      title="Disconnect account"
      description="We stop posting to this account."
      trigger={
        <Button variant="outline" size="sm">
          Disconnect
        </Button>
      }
    >
      <ActionForm action={disconnectFromSpaceAction} submitLabel="Disconnect" pendingLabel="Disconnecting">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="accountId" value={accountId} />
      </ActionForm>
    </FormDrawer>
  );
}
