"use client";

import * as React from "react";
import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POST_TYPES, POST_TYPE_LABEL, WEEKDAY_LABEL, type PostType } from "@/lib/social-plan";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelSocialPostAction,
  disconnectSocialAction,
  moveSocialPostAction,
  saveAutopostAction,
  savePieceSettingsAction,
  sendToSocialAction,
} from "./social-actions";

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

/** Defaults to the browser's zone; `initial` wins when given (a saved client setting). */
function TimeZoneField({ initial }: { initial?: string }) {
  const browserZone = React.useSyncExternalStore(noSubscribe, browserTimeZone, () => "UTC");
  const [picked, setPicked] = React.useState<string | null>(initial ?? null);
  const timezone = picked ?? browserZone;
  const zones = React.useMemo(() => timeZones(), []);
  return (
    <ActionField name="timezone" label="Time zone">
      <select name="timezone" className={selectClass} value={timezone} onChange={(event) => setPicked(event.target.value)}>
        {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </ActionField>
  );
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
      <TimeZoneField />
      {mode !== "draft" && waiting > 0 ? (
        <p className="text-sm text-muted-foreground">
          {waiting} picked piece{waiting === 1 ? " is" : "s are"} not approved by the client. Those stay unsent.
        </p>
      ) : null}
    </ActionForm>
  );
}

/** Text per network, a first comment, and YouTube tags, kept with one piece and used by every later send. */
export function PieceSettingsForm({
  deliverableId,
  itemId,
  title,
  platforms,
  texts,
  firstComment,
  tags,
}: {
  deliverableId: string;
  itemId: string;
  title: string;
  platforms: { id: string; label: string }[];
  texts: Record<string, string>;
  firstComment: string;
  tags: string;
}) {
  const custom = Object.keys(texts).length;
  return (
    <FormDrawer
      title={`Text per network: ${title}`}
      description="Leave a box empty to use the piece's caption."
      trigger={
        <Button variant="outline" size="sm">
          {custom > 0 ? `Text per network (${custom})` : "Text per network"}
        </Button>
      }
    >
      <ActionForm action={savePieceSettingsAction} submitLabel="Save" pendingLabel="Saving">
        <input type="hidden" name="deliverableId" value={deliverableId} />
        <input type="hidden" name="itemId" value={itemId} />
        {platforms.map((platform) => (
          <ActionField key={platform.id} name={`text:${platform.id}`} label={platform.label}>
            <Textarea name={`text:${platform.id}`} rows={3} defaultValue={texts[platform.id] ?? ""} />
          </ActionField>
        ))}
        <ActionField name="firstComment" label="First comment (Instagram, Facebook, LinkedIn, YouTube, Threads, X)">
          <Textarea name="firstComment" rows={2} defaultValue={firstComment} />
        </ActionField>
        <ActionField name="tags" label="YouTube tags, comma separated">
          <Input name="tags" defaultValue={tags} />
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}

export function MoveSocialPostForm({ organizationId, postId, timezone }: { organizationId: string; postId: string; timezone: string }) {
  return (
    <FormDrawer
      title="Move post"
      description="Pick the new time. Zernio posts it then."
      trigger={
        <Button variant="outline" size="sm">
          Move
        </Button>
      }
    >
      <ActionForm action={moveSocialPostAction} submitLabel="Move" pendingLabel="Moving">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="postId" value={postId} />
        <ActionField name="startAt" label="New time">
          <Input type="datetime-local" name="startAt" required />
        </ActionField>
        <TimeZoneField initial={timezone} />
      </ActionForm>
    </FormDrawer>
  );
}

export function CancelSocialPostForm({ organizationId, postId }: { organizationId: string; postId: string }) {
  return (
    <FormDrawer
      title="Cancel post"
      description="It comes off Zernio and will not post. The piece stays in finished work."
      trigger={
        <Button variant="outline" size="sm">
          Cancel
        </Button>
      }
    >
      <ActionForm action={cancelSocialPostAction} submitLabel="Cancel post" pendingLabel="Cancelling">
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="postId" value={postId} />
      </ActionForm>
    </FormDrawer>
  );
}

/** When on, each piece the client approves is scheduled into the next free slot on these accounts. */
export function AutopostForm({
  organizationId,
  accounts,
  settings,
}: {
  organizationId: string;
  accounts: SendAccount[];
  settings: { enabled: boolean; accountIds: string[]; weekdays: number[]; times: string[]; timezone: string };
}) {
  const [accountIds, setAccountIds] = React.useState(() => new Set(settings.accountIds));
  return (
    <ActionForm action={saveAutopostAction} submitLabel="Save auto-schedule" pendingLabel="Saving">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
        Schedule each piece the client approves
      </label>
      <fieldset className="flex flex-col gap-2">
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
      <fieldset className="flex flex-wrap gap-3">
        <legend className="mb-1 text-sm font-medium">Days</legend>
        {WEEKDAY_LABEL.map((label, day) => (
          <label key={label} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" name="weekday" value={day} defaultChecked={settings.weekdays.includes(day)} />
            {label}
          </label>
        ))}
      </fieldset>
      <ActionField name="times" label="Times (24-hour, comma separated)">
        <Input name="times" defaultValue={settings.times.join(", ")} placeholder="09:00, 17:30" />
      </ActionField>
      <TimeZoneField initial={settings.timezone === "UTC" && !settings.enabled ? undefined : settings.timezone} />
    </ActionForm>
  );
}
