"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_LABEL,
  boardCards,
  skillSteps,
  type BoardColumn,
} from "@/lib/board-model";
import { moveBoardCardAction } from "./actions";
import type { BoardActivity } from "@/db/crm";

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

function CardMenu({ card }: { card: WorkBoardCard }) {
  const [reason, setReason] = useState("");
  const { pending, send } = useCardMove(card);
  const column = card.status === "done" ? "done" : card.stage;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Move ${card.title}`} disabled={pending}>
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

function CardFace({
  card,
  now,
  showClient,
  showProject,
  notes,
}: {
  card: WorkBoardCard;
  now: number;
  showClient: boolean;
  showProject: boolean;
  notes: BoardActivity[];
}) {
  const late = card.due_at !== null && card.due_at < now && card.status !== "done";
  const waiting = card.stage === "build" && card.status === "todo" && !card.cursor_agent_id && !card.blocked_reason;
  const steps = skillSteps(card.skills_json);
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
        </div>
        <CardMenu card={card} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot domain="task" value={card.status === "done" ? "done" : card.status} />
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
      {card.blocked_reason ? (
        <p className="text-xs text-muted-foreground">
          {card.blocked_reason}
          {CLEARING[card.blocked_reason] ? ` ${CLEARING[card.blocked_reason]}` : ""}
        </p>
      ) : null}
      {waiting ? <p className="text-xs text-muted-foreground">Waiting for a free cloud run.</p> : null}
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
  activity,
}: {
  cards: WorkBoardCard[];
  now: number;
  showClient: boolean;
  showProject: boolean;
  runCap: number | null;
  activity: BoardActivity[];
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
  function dropCard(taskId: string, column: BoardColumn) {
    const card = cards.find((item) => item.id === taskId);
    if (!card) return;
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
          const capNote = column === "build" && runCap !== null ? ` · ${items.length}/${runCap}` : "";
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
                />
              ))}
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
