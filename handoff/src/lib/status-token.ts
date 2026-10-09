import { DEAL_STAGE_LABEL, type DealStage } from "@/db/crm";
import { DELIVERABLE_STATUS_LABEL } from "@/app/deliverables/labels";
import { HEALTH_LABEL, PROJECT_STATUS_LABEL, TASK_STATUS_LABEL } from "@/app/projects/labels";
import type { DeliverableStatus } from "@/db/deliverables";
import type { ProjectStatus, StatusHealth, TaskStatus } from "@/db/crm";

/**
 * The six status colors defined as tokens in `globals.css`
 * (`--status-{tone}` / `--status-{tone}-fg`, exposed as `bg-status-*`).
 * Every status shown in HQ maps onto one of these so color stays consistent
 * across tables, badges, and dots.
 */
export const STATUS_TONES = [
  "late",
  "blocked",
  "waiting",
  "active",
  "complete",
  "neutral",
] as const;

export type StatusTone = (typeof STATUS_TONES)[number];

export type StatusDomain =
  | "task"
  | "project"
  | "health"
  | "deliverable"
  | "deal"
  | "schema"
  | "lead"
  | "github";

export type StatusToken = { tone: StatusTone; label: string };

type ToneMap = Record<string, StatusToken>;

function build<K extends string>(labels: Record<K, string>, tones: Record<K, StatusTone>): ToneMap {
  const out: ToneMap = {};
  for (const key of Object.keys(labels) as K[]) {
    out[key] = { tone: tones[key], label: labels[key] };
  }
  return out;
}

const TASK: ToneMap = {
  ...build<TaskStatus>(TASK_STATUS_LABEL, {
    todo: "neutral",
    doing: "active",
    blocked: "blocked",
    done: "complete",
  }),
  // "late" is derived from a due date, not a stored status, but tables show it.
  late: { tone: "late", label: "Late" },
};

const PROJECT: ToneMap = build<ProjectStatus>(PROJECT_STATUS_LABEL, {
  planned: "neutral",
  active: "active",
  waiting_on_client: "waiting",
  done: "complete",
  paused: "neutral",
  cancelled: "neutral",
});

const HEALTH: ToneMap = build<StatusHealth>(HEALTH_LABEL, {
  on_track: "active",
  at_risk: "waiting",
  off_track: "late",
  done: "complete",
});

const DELIVERABLE: ToneMap = build<DeliverableStatus>(DELIVERABLE_STATUS_LABEL, {
  draft: "neutral",
  in_review: "waiting",
  approved: "complete",
  changes_requested: "blocked",
  archived: "neutral",
});

const DEAL: ToneMap = build<DealStage>(DEAL_STAGE_LABEL, {
  new: "neutral",
  contacted: "active",
  call_booked: "active",
  proposal: "waiting",
  won: "complete",
  lost: "neutral",
});

const SCHEMA: ToneMap = {
  pass: { tone: "active", label: "Pass" },
  fail: { tone: "late", label: "Fail" },
  pending: { tone: "waiting", label: "Running" },
};

const LEAD: ToneMap = {
  open: { tone: "active", label: "Open" },
  won: { tone: "complete", label: "Won" },
  lost: { tone: "neutral", label: "Lost" },
};

const GITHUB: ToneMap = {
  connected: { tone: "active", label: "Connected" },
  disconnected: { tone: "neutral", label: "Not connected" },
  error: { tone: "late", label: "Error" },
};

const DOMAINS: Record<StatusDomain, ToneMap> = {
  task: TASK,
  project: PROJECT,
  health: HEALTH,
  deliverable: DELIVERABLE,
  deal: DEAL,
  schema: SCHEMA,
  lead: LEAD,
  github: GITHUB,
};

/**
 * Resolve a raw status value to a color tone and a plain-language label.
 * Unknown values fall back to neutral and show the raw value so nothing
 * disappears from a table because a new status was added upstream.
 */
export function statusToken(domain: StatusDomain, value: string): StatusToken {
  return DOMAINS[domain][value] ?? { tone: "neutral", label: value };
}
