"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { mapSearchPropertyAction, removeSearchPropertyAction, requestSearchSyncAction } from "../search-actions";

export function MapSearchPropertyForm({ organizationId, suggestion }: { organizationId: string; suggestion: string }) {
  return (
    <ActionForm action={mapSearchPropertyAction} submitLabel="Map property" pendingLabel="Mapping">
      <input type="hidden" name="organizationId" value={organizationId} />
      <ActionField name="siteUrl" label="Search Console property">
        <Input name="siteUrl" required maxLength={300} defaultValue={suggestion} placeholder="sc-domain:client.com" />
      </ActionField>
    </ActionForm>
  );
}

export function RemoveSearchPropertyForm({ organizationId, propertyId }: { organizationId: string; propertyId: string }) {
  return (
    <ActionForm action={removeSearchPropertyAction} submitLabel="Remove" pendingLabel="Removing" className="flex-row items-center gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="propertyId" value={propertyId} />
    </ActionForm>
  );
}

/** Only enqueues work for the handoff Worker. */
export function SyncSearchPropertyForm({ organizationId, propertyId, mode }: { organizationId: string; propertyId: string; mode: "daily" | "backfill" }) {
  return (
    <ActionForm
      action={requestSearchSyncAction}
      submitLabel={mode === "backfill" ? "Load history" : "Sync now"}
      pendingLabel="Queuing"
      className="flex-row items-center gap-2"
    >
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="mode" value={mode} />
    </ActionForm>
  );
}
