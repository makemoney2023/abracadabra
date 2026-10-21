"use client";

import * as React from "react";
import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POST_TYPES, POST_TYPE_LABEL, type PostType } from "@/lib/social-plan";
import { disconnectSocialAction, sendToSocialAction } from "./social-actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function DisconnectSocialForm({ organizationId, accountId }: { organizationId: string; accountId: string }) {
  return (
    <FormDrawer
      title="Disconnect account"
      description="Posts stop going to this account. Scheduled posts for it will fail."
      trigger={
        <Button variant="outline" size="sm">
          Disconnect
        </Button>
      }
    >
      <ActionForm action={disconnectSocialAction} submitLabel="Disconnect" pendingLabel="Disconnecting">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="accountId" value={accountId} />
      </ActionForm>
    </FormDrawer>
  );
}

export type SendPiece = {
  id: string;
  title: string;
  format: string;
  defaultType: PostType;
  approved: boolean;
  sent: string | null;
};

export type SendAccount = { id: string; label: string };

const GAPS = [
  { minutes: 0, label: "All at the same time" },
  { minutes: 60, label: "1 hour apart" },
  { minutes: 180, label: "3 hours apart" },
  { minutes: 1440, label: "1 day apart" },
  { minutes: 2880, label: "2 days apart" },
  { minutes: 10080, label: "1 week apart" },
];

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

const noSubscribe = () => () => undefined;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function SelectAll({
  label,
  ids,
  selected,
  onChange,
}: {
  label: string;
  ids: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [some, all]);
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        onChange={(event) => onChange(event.target.checked ? new Set(ids) : new Set())}
      />
      {label}
    </label>
  );
}

function toggle(set: Set<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

/** One form for one piece or select-all: pick pieces, pick accounts, then draft, schedule, or post now. */
export function SendToSocialForm({
  deliverableId,
  pieces,
  accounts,
}: {
  deliverableId: string;
  pieces: SendPiece[];
  accounts: SendAccount[];
}) {
  const [pieceIds, setPieceIds] = React.useState(() => new Set(pieces.filter((piece) => piece.approved).map((piece) => piece.id)));
  const [accountIds, setAccountIds] = React.useState(() => new Set(accounts.map((account) => account.id)));
  const [mode, setMode] = React.useState<"draft" | "scheduled" | "now">("scheduled");
  const browserZone = React.useSyncExternalStore(noSubscribe, browserTimeZone, () => "UTC");
  const [picked, setTimezone] = React.useState<string | null>(null);
  const timezone = picked ?? browserZone;
  const zones = React.useMemo(() => timeZones(), []);
  const waiting = pieces.filter((piece) => pieceIds.has(piece.id) && !piece.approved).length;
  return (
    <ActionForm
      action={sendToSocialAction}
      submitLabel={mode === "draft" ? "Save as drafts" : mode === "now" ? "Post now" : "Schedule"}
      pendingLabel="Sending"
    >
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <fieldset className="flex flex-col gap-2" data-field="itemId">
        <SelectAll label="All pieces" ids={pieces.map((piece) => piece.id)} selected={pieceIds} onChange={setPieceIds} />
        {pieces.map((piece) => (
          <label key={piece.id} className="flex flex-wrap items-center gap-2 pl-6 text-sm">
            <input
              type="checkbox"
              name="itemId"
              value={piece.id}
              checked={pieceIds.has(piece.id)}
              onChange={(event) => setPieceIds((current) => toggle(current, piece.id, event.target.checked))}
            />
            <span>{piece.title}</span>
            <span className="text-muted-foreground">
              {piece.format} · {POST_TYPE_LABEL[piece.defaultType]}
            </span>
            {piece.approved ? null : <span className="text-muted-foreground">Not approved yet</span>}
            {piece.sent ? <span className="text-muted-foreground">{piece.sent}</span> : null}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-col gap-2" data-field="accountId">
        <SelectAll label="All accounts" ids={accounts.map((account) => account.id)} selected={accountIds} onChange={setAccountIds} />
        {accounts.map((account) => (
          <label key={account.id} className="flex items-center gap-2 pl-6 text-sm">
            <input
              type="checkbox"
              name="accountId"
              value={account.id}
              checked={accountIds.has(account.id)}
              onChange={(event) => setAccountIds((current) => toggle(current, account.id, event.target.checked))}
            />
            {account.label}
          </label>
        ))}
      </fieldset>
      <ActionField name="postType" label="Post as">
        <select name="postType" className={selectClass} defaultValue="auto">
          <option value="auto">Match each piece (story, carousel, reel, or feed)</option>
          {POST_TYPES.map((type) => (
            <option key={type} value={type}>
              {POST_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </ActionField>
      <ActionField name="mode" label="When">
        <select
          name="mode"
          className={selectClass}
          value={mode}
          onChange={(event) => setMode(event.target.value as typeof mode)}
        >
          <option value="scheduled">Schedule</option>
          <option value="now">Post now</option>
          <option value="draft">Save as drafts in Zernio</option>
        </select>
      </ActionField>
      {mode === "scheduled" ? (
        <>
          <ActionField name="startAt" label="First post">
            <Input type="datetime-local" name="startAt" required />
          </ActionField>
          <ActionField name="gapMinutes" label="Space the rest">
            <select name="gapMinutes" className={selectClass} defaultValue="1440">
              {GAPS.map((gap) => (
                <option key={gap.minutes} value={gap.minutes}>
                  {gap.label}
                </option>
              ))}
            </select>
          </ActionField>
        </>
      ) : null}
      <ActionField name="timezone" label="Time zone">
        <select name="timezone" className={selectClass} value={timezone} onChange={(event) => setTimezone(event.target.value)}>
          {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </ActionField>
      {mode !== "draft" && waiting > 0 ? (
        <p className="text-sm text-muted-foreground">
          {waiting} picked piece{waiting === 1 ? " is" : "s are"} not approved by the client. Those stay unsent.
        </p>
      ) : null}
    </ActionForm>
  );
}
