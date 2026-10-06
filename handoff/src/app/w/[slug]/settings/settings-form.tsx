"use client";

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: SettingsState = { message: "" };

export function SettingsForm({
  slug,
  policyProfile,
  quotaBytes,
  canConfigure,
  canBrand,
}: {
  slug: string;
  policyProfile: string;
  quotaBytes: number;
  canConfigure: boolean;
  canBrand: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      {canConfigure ? (
        <>
          <label className="flex flex-col gap-1 text-sm" htmlFor="settings-profile">
            File rules
            <select
              id="settings-profile"
              name="policyProfile"
              className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              defaultValue={policyProfile}
            >
              <option value="standard">Standard</option>
              <option value="software">Software</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm" htmlFor="settings-quota">
            Storage limit (in bytes)
            <Input id="settings-quota" name="quotaBytes" type="number" min={0} required defaultValue={quotaBytes} />
          </label>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          File rules: {policyProfile}. Storage limit: {quotaBytes} bytes.
        </p>
      )}
      {canBrand ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor="settings-logo">
          Logo
          <Input id="settings-logo" name="logo" type="file" accept="image/png,image/webp" />
        </label>
      ) : null}
      {canConfigure || canBrand ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save"}
        </Button>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
