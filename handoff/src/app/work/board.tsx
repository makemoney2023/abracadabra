"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BotIcon, MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_LABEL,
  boardCards,
  columnOf,
  inReview,
  skillSteps,
  type BoardColumn,
} from "@/lib/board-model";
import { swarmRunReady } from "@/lib/swarm-ready";
import { assignBoardAgentAction, assignTaskPackAction, moveBoardCardAction, reviewCardAction } from "./actions";
import type { BoardActivity, BoardAgent } from "@/db/crm";

export type WorkBoardCard = {
  id: string;
  title: string;
  status: string;
  stage: string;
  position: number;
  created_at: number;
  done_at: number | null;
  due_at: number | null;
  project_id: string | null;
  project_name: string | null;
  organization_id: string;
  organization_name: string;
  round: number;
  created_by_kind: string;
  blocked_reason: string | null;
  skills_json: string | null;
  cursor_agent_id: string | null;
  run_started_at: number | null;
  pr_number: number | null;
  repo_full_name: string | null;
  review_requested_at?: number | null;
  review_note?: string | null;
  /** Skill pack prefixes the card's agents attached from the library. */
  skill_packs?: string[];
  /** The client agent that owns the card. null: the client's lead agent. */
  assignee_agent_id?: string | null;
  assignee_agent_label?: string | null;
};

const CLEARING: Record<string, string> = {
  link_a_repo: "Pick a repo.",
  repo_create_failed: "Retry creating a repo.",
  repo_name_taken: "Choose another repo name.",
  brief_not_approved: "Approve the brief.",
  design_system_not_approved: "Approve the design system.",
  missing_build_brief: "Write the build brief.",
  cursor_start_failed: "Retry the run.",
  agent_paused: "Resume the agent.",
  prompt_rejected: "Rewrite the build brief.",
  waiting_on_staff: "Answer the question.",
};

function skillLabel(path: string): string {
  const parts = path.split("/");
  return parts.at(-2) || parts.at(-1) || path;
}

function useCardMove(card: WorkBoardCard) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function send(fields: Record<string, string>) {
    const data = new FormData();
    data.set("taskId", card.id);
    data.set("organizationId", card.organization_id);
    data.set("projectId", card.project_id ?? "");
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    startTransition(async () => {
      const result = await moveBoardCardAction(data);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  return { pending, send };
}

function useAssignAgent(card: WorkBoardCard) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function assign(agentId: string | null) {
    const data = new FormData();
    data.set("taskId", card.id);
    data.set("organizationId", card.organization_id);
    data.set("projectId", card.project_id ?? "");
    data.set("agentId", agentId ?? "");
    startTransition(async () => {
      const result = await assignBoardAgentAction(data);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }
  return { assigning: pending, assign };
}

/** The card's owner: its agent assignee, else the client's lead (default), else nobody yet. */
function AgentBadge({ card, agents }: { card: WorkBoardCard; agents: BoardAgent[] }) {
  if (card.assignee_agent_id) {
    const live = agents.some((agent) => agent.id === card.assignee_agent_id);
    const label = card.assignee_agent_label || card.assignee_agent_id;
    return (
      <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px] font-normal" title={live ? `Assigned to ${label}` : `${label} is no longer on this client. The lead gets it.`}>
        <BotIcon aria-hidden className="size-3" />
        {label}
        {live ? null : " (off client)"}
      </Badge>
    );
  }
  const lead = agents.find((agent) => agent.role === "lead");
  if (!lead) return null;
  return (
    <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground" title="No agent assignee: the client's lead agent has it">
      <BotIcon aria-hidden className="size-3" />
      {lead.label} · lead
    </Badge>
  );
}

function CardMenu({ card, agents = [] }: { card: WorkBoardCard; agents?: BoardAgent[] }) {
  const [reason, setReason] = useState("");
  const { pending, send } = useCardMove(card);
  const { assigning, assign } = useAssignAgent(card);
  const column = columnOf(card);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Move ${card.title}`} disabled={pending || assigning}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {BOARD_COLUMNS.filter((item) => item !== column).map((item) => (
          <DropdownMenuItem key={item} onSelect={() => send({ to: item })}>
            {BOARD_COLUMN_LABEL[item]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => send({ direction: "up" })}>Move up</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => send({ direction: "down" })}>Move down</DropdownMenuItem>
        {agents.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Assign to agent</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem disabled={!card.assignee_agent_id} onSelect={() => assign(null)}>
                  Lead (default)
                </DropdownMenuItem>
                {agents.map((agent) => (
                  <DropdownMenuItem key={agent.id} disabled={agent.id === card.assignee_agent_id} onSelect={() => assign(agent.id)}>
                    {agent.label}
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">{agent.role}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1.5 px-2 py-1.5">
          <label className="text-xs" htmlFor={`block-${card.id}`}>
            Blocked
          </label>
          <Input
            id={`block-${card.id}`}
            value={reason}
            maxLength={200}
            placeholder="Say why"
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
          <Button size="sm" type="button" disabled={pending || reason.trim().length === 0} onClick={() => send({ blockedReason: reason })}>
            Block
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Staff decision on a card in Review: approve to done, or send back with a note. */
function ReviewPanel({ card, now, override }: { card: WorkBoardCard; now: number; override: boolean }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function decide(decision: "approve" | "progress" | "build") {
    const data = new FormData();
    data.set("taskId", card.id);
    data.set("organizationId", card.organization_id);
    data.set("projectId", card.project_id ?? "");
    data.set("decision", decision);
    data.set("note", note);
    startTransition(async () => {
      const result = await reviewCardAction(data);
      if (result.ok) {
        toast.success(result.message);
        setNote("");
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }
  const from = columnOf({ status: "todo", stage: card.stage });
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 p-2" aria-label={`Review ${card.title}`}>
      <p className="text-xs text-muted-foreground">
        Waiting on Client Services{card.review_requested_at ? ` · ${formatRelative(card.review_requested_at, now)}` : ""} · from{" "}
        {BOARD_COLUMN_LABEL[from]}
      </p>
      {card.review_note ? <p className="whitespace-pre-wrap text-xs">{card.review_note}</p> : null}
      {override ? (
        <details className="text-xs">
          <summary className="text-muted-foreground">Admin override</summary>
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="text-muted-foreground">Client Services approves Review cards. Use this only to step in for it.</p>
            <Input
              value={note}
              maxLength={2000}
              placeholder="Note (needed to send back)"
              aria-label={`Review note for ${card.title}`}
              onChange={(event) => setNote(event.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" type="button" variant="outline" disabled={pending} onClick={() => decide("approve")}>
                Override: approve
              </Button>
              <Button size="sm" type="button" variant="outline" disabled={pending || note.trim().length === 0} onClick={() => decide("progress")}>
                Override: send back
              </Button>
              <Button size="sm" type="button" variant="ghost" disabled={pending || note.trim().length === 0} onClick={() => decide("build")}>
                Override: back to Doing
              </Button>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** A short name for a library prefix: "community/marketingskills/" is marketingskills, ".../openvid/SKILL.md" is openvid. */
function skillChipName(prefix: string): string {
  const parts = prefix.replace(/\/SKILL\.md$/, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? prefix;
}

function SkillChips({ prefixes }: { prefixes: string[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-1" aria-label="Skill packs attached">
      {prefixes.map((prefix) => (
        <li key={prefix}>
          <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal" title={prefix}>
            {skillChipName(prefix)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function CardFace({
  card,
  now,
  showClient,
  showProject,
  notes,
  running,
  packs,
  onMove,
  reviewOverride = false,
  agents = [],
}: {
  card: WorkBoardCard;
  now: number;
  showClient: boolean;
  showProject: boolean;
  notes: BoardActivity[];
  running: boolean;
  packs: { id: string; name: string }[];
  onMove: (taskId: string, column: BoardColumn | "run") => void;
  reviewOverride?: boolean;
  /** Live agents of this card's client. */
  agents?: BoardAgent[];
}) {
  const late = card.due_at !== null && card.due_at < now && card.status !== "done";
  const review = inReview(card);
  const waiting = card.stage === "build" && card.status === "todo" && !card.cursor_agent_id && !card.blocked_reason;
  const steps = skillSteps(card.skills_json);
  const brief = notes.find((note) => note.kind === "agent.task_brief")?.body;
  const swarm = swarmRunReady({
    status: card.status,
    stage: card.stage,
    skillsJson: card.skills_json,
    running,
  });
  const packName = packs.find((pack) => pack.id === swarm.templateId)?.name ?? swarm.templateId ?? "";
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const doneSteps = steps.filter((step) => step.status === "done").length;
  const pr =
    card.pr_number && card.repo_full_name ? `https://github.com/${card.repo_full_name}/pull/${card.pr_number}` : "";

  return (
    <article
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{card.title}</p>
          {showClient ? (
            <Link href={`/clients/${card.organization_id}`} className="block truncate text-sm text-muted-foreground">
              {card.organization_name}
            </Link>
          ) : null}
          {showProject && card.project_id ? (
            <Link href={`/projects/${card.project_id}`} className="block truncate text-sm text-muted-foreground">
              {card.project_name || "Project"}
            </Link>
          ) : null}
          {showProject && !card.project_id ? <p className="text-sm text-muted-foreground">No project</p> : null}
          {brief ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{brief}</p> : null}
        </div>
        <CardMenu card={card} agents={agents} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot domain="task" value={card.status === "done" ? "done" : card.status} />
        <AgentBadge card={card} agents={agents} />
        {card.created_by_kind === "agent" ? <Badge variant="secondary">Agent</Badge> : null}
        {card.round > 1 ? <Badge variant="secondary">Round {card.round}</Badge> : null}
        {steps.length > 0 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {doneSteps}/{steps.length}
          </span>
        ) : null}
        {card.due_at !== null ? (
          <span className={late ? "text-xs text-status-late" : "text-xs text-muted-foreground"}>
            {formatRelative(card.due_at, now)}
          </span>
        ) : null}
      </div>
      {card.skill_packs && card.skill_packs.length > 0 ? <SkillChips prefixes={card.skill_packs} /> : null}
      {card.blocked_reason ? (
        <p className="text-xs text-muted-foreground">
          {card.blocked_reason}
          {CLEARING[card.blocked_reason] ? ` ${CLEARING[card.blocked_reason]}` : ""}
        </p>
      ) : null}
      {waiting ? <p className="text-xs text-muted-foreground">Waiting for a free cloud run.</p> : null}
      {card.status !== "done" && swarm.templateId && running ? (
        <p className="text-xs text-muted-foreground">{packName} is still going.</p>
      ) : null}
      {card.status !== "done" && card.stage === "run" && swarm.templateId && !running ? (
        <p className="text-xs text-muted-foreground">{packName} is scheduled.</p>
      ) : null}
      {review ? <ReviewPanel card={card} now={now} override={reviewOverride} /> : null}
      {swarm.ready && !review ? (
        <Button size="sm" type="button" disabled={pending} onClick={() => onMove(card.id, "run")}>
          Run swarm
        </Button>
      ) : null}
      {!swarm.templateId && card.status !== "done" && packs.length > 0 ? (
        <div className="flex items-center gap-2">
          <select
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-xs"
            value={packId}
            onChange={(event) => setPackId(event.target.value)}
          >
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            type="button"
            disabled={pending || packId.length === 0}
            onClick={() => {
              const data = new FormData();
              data.set("taskId", card.id);
              data.set("organizationId", card.organization_id);
              data.set("projectId", card.project_id ?? "");
              data.set("templateId", packId);
              startTransition(async () => {
                const result = await assignTaskPackAction(data);
                if (result.ok) {
                  toast.success(result.message);
                  router.refresh();
                  return;
                }
                toast.error(result.message);
              });
            }}
          >
            Choose pack
          </Button>
        </div>
      ) : null}
      {card.run_started_at && card.status === "doing" ? (
        <p className="text-xs text-muted-foreground">Started {formatRelative(card.run_started_at, now)}</p>
      ) : null}
      {pr ? (
        <a className="text-xs" href={pr}>
          Pull request #{card.pr_number}
        </a>
      ) : null}
      <details className="text-xs">
        <summary>Details</summary>
        {steps.length === 0 ? <p className="mt-2 text-muted-foreground">No skills on this card.</p> : null}
        {steps.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {steps.map((step) => (
              <li key={step.path}>
                {step.status === "done" ? "Done" : step.status === "doing" ? "Doing" : "To do"} · {skillLabel(step.path)}
              </li>
            ))}
          </ul>
        ) : null}
        {notes.length === 0 ? <p className="mt-2 text-muted-foreground">No agent notes yet.</p> : null}
        {notes.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id}>
                {note.body || note.kind}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </article>
  );
}

export function WorkBoard({
  cards,
  now,
  showClient,
  showProject,
  runCap,
  runsOpen,
  activity,
  runningTaskIds = [],
  packs = [],
  reviewOverride = false,
  agents = [],
}: {
  cards: WorkBoardCard[];
  now: number;
  showClient: boolean;
  showProject: boolean;
  runCap: number | null;
  runsOpen: number;
  activity: BoardActivity[];
  runningTaskIds?: string[];
  packs?: { id: string; name: string }[];
  /** Super admins see the admin override on Review cards. Client Services decides them through its API. */
  reviewOverride?: boolean;
  /** Live client agents of the clients on this board (badge and Assign to agent). */
  agents?: BoardAgent[];
}) {
  const columns = boardCards(cards);
  const notes = new Map<string, BoardActivity[]>();
  for (const note of activity) {
    const list = notes.get(note.taskId);
    if (list) list.push(note);
    else notes.set(note.taskId, [note]);
  }
  const router = useRouter();
  const [, startTransition] = useTransition();
  function dropCard(taskId: string, column: BoardColumn | "run") {
    const card = cards.find((item) => item.id === taskId);
    if (!card) return;
    if (columnOf(card) === column) return;
    const data = new FormData();
    data.set("taskId", card.id);
    data.set("organizationId", card.organization_id);
    data.set("projectId", card.project_id ?? "");
    data.set("to", column);
    startTransition(async () => {
      const result = await moveBoardCardAction(data);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }
  return (
    <ScrollArea className="w-full">
      <div className="flex w-max gap-3 pb-3">
        {BOARD_COLUMNS.map((column) => {
          const items = columns[column];
          const capNote = column === "doing" && runCap !== null ? ` · ${runsOpen}/${runCap}` : "";
          return (
            <section
              key={column}
              aria-label={BOARD_COLUMN_LABEL[column]}
              className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/plain");
                if (taskId) dropCard(taskId, column);
              }}
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                {BOARD_COLUMN_LABEL[column]}
                {capNote}
                <span className="tabular-nums text-muted-foreground">{items.length}</span>
              </h2>
              {items.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">Nothing in {BOARD_COLUMN_LABEL[column]}.</p>
              ) : null}
              {items.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  now={now}
                  showClient={showClient}
                  showProject={showProject}
                  notes={notes.get(card.id) ?? []}
                  running={runningTaskIds.includes(card.id)}
                  packs={packs}
                  onMove={dropCard}
                  reviewOverride={reviewOverride}
                  agents={agents.filter((agent) => agent.organization_id === card.organization_id)}
                />
              ))}
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
