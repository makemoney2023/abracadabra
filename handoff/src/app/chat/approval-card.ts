import { createElement, type ReactNode } from "react";
import { getToolApproval, getToolInput, getToolPartState } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HQ_TOOL_HELP } from "@/lib/hq-tool-names";

function toolName(part: unknown): string {
  const type = (part as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("tool-") ? type.slice(5) : "";
}

/** Staff see the action and every field before they approve. Rejecting writes nothing. */
export function approvalCard(part: unknown, onDecide: (id: string, approved: boolean) => void): ReactNode {
  if (getToolPartState(part as never) !== "waiting-approval") return null;
  const approval = getToolApproval(part as never);
  if (!approval?.id) return null;
  const name = toolName(part);
  const input = getToolInput(part as never);
  const fields =
    input && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== "")
      : [];
  return createElement(
    Card,
    null,
    createElement(CardHeader, null, createElement(CardTitle, null, HQ_TOOL_HELP[name]?.label ?? (name || "Approve this action"))),
    createElement(
      CardContent,
      { className: "flex flex-col gap-4" },
      createElement(
        "dl",
        { className: "grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" },
        ...fields.flatMap(([key, value]) => [
          createElement("dt", { key: `${key}-k`, className: "text-muted-foreground" }, key),
          createElement("dd", { key: `${key}-v`, className: "break-words" }, String(value)),
        ]),
      ),
      createElement(
        "div",
        { className: "flex gap-2" },
        createElement(Button, { type: "button", onClick: () => onDecide(approval.id, true) }, "Approve"),
        createElement(Button, { type: "button", variant: "outline", onClick: () => onDecide(approval.id, false) }, "Reject"),
      ),
    ),
  );
}
