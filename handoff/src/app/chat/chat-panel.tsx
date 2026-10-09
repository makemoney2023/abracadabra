"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { UIMessage } from "ai";
import { useAgent } from "agents/react";
import { getToolInput, getToolOutput, getToolPartState, useAgentChat } from "@cloudflare/ai-chat/react";
import { Markdown } from "@/components/markdown";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";
import type { ChatPageContext } from "@/lib/hq-chat-context";
import { conversationTitle, starterPrompts, toolTaskStatus } from "@/lib/hq-chat-playbook";
import { HQ_TOOL_HELP } from "@/lib/hq-tool-names";
import { approvalCard } from "./approval-card";

type Session = { token: string; userId: string; host: string; fetchedAt: number };

/** Tokens live 10 minutes. Refresh at 8 so a send never carries an expired one. */
const TOKEN_REFRESH_MS = 8 * 60 * 1000;

async function fetchSession(): Promise<Session> {
  const response = await fetch("/api/hq-chat/token", { cache: "no-store" });
  if (!response.ok) throw new Error("unavailable");
  const body = (await response.json()) as Omit<Session, "fetchedAt">;
  return { ...body, fetchedAt: Date.now() };
}

export function ChatPanel({ context, layout = "page" }: { context?: ChatPageContext; layout?: "page" | "drawer" }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetchSession()
      .then((body) => {
        if (live) setSession(body);
      })
      .catch(() => {
        if (live) setError("Chat is not available.");
      });
    return () => {
      live = false;
    };
  }, []);
  if (error || (session && !session.host)) {
    return <p className="text-sm text-muted-foreground">Chat is not available.</p>;
  }
  if (!session?.token) return <p className="text-sm text-muted-foreground">Opening chat…</p>;
  return <LiveChat first={session} context={context} layout={layout} />;
}

function LiveChat({ first, context, layout }: { first: Session; context?: ChatPageContext; layout: "page" | "drawer" }) {
  const current = useRef({ token: first.token, at: first.fetchedAt });
  const freshToken = useCallback(async () => {
    if (Date.now() - current.current.at < TOKEN_REFRESH_MS) return current.current.token;
    const next = await fetchSession();
    current.current = { token: next.token, at: next.fetchedAt };
    return next.token;
  }, []);
  const agent = useAgent({
    agent: "hq-chat",
    name: first.userId,
    host: first.host,
    query: async () => ({ token: await freshToken() }),
    cacheTtl: TOKEN_REFRESH_MS,
  });
  const chat = useAgentChat({
    agent,
    body: async () => ({ token: await freshToken(), context: context ?? {} }),
  });
  const [text, setText] = useState("");
  const pending = chat.status === "submitted" || chat.status === "streaming" || chat.isStreaming;
  const title = conversationTitle(chat.messages);

  function send(raw: string) {
    const next = raw.trim();
    if (!next || pending) return;
    void chat.sendMessage({ text: next });
    setText("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send(text);
  }

  function startNew() {
    void chat.stop();
    chat.clearHistory();
    setText("");
  }

  const decide = (id: string, approved: boolean) => {
    void chat.addToolApprovalResponse({ id, approved });
  };

  const thread = (
    <div className={layout === "drawer" ? "flex min-h-0 flex-1 flex-col" : "flex h-[min(40rem,calc(100dvh-14rem))] min-h-80 flex-col"}>
      {chat.connectionError ? (
        <p className="text-sm text-destructive">Chat lost its connection. Reload the page to sign in again.</p>
      ) : null}
      {chat.error ? <p className="text-sm text-destructive">{chat.error.message.split("\n")[0]}</p> : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 pr-3">
          {chat.messages.length === 0 ? <Starters onPick={setText} /> : null}
          <ul className="flex flex-col gap-4">
            {chat.messages.map((message) => (
              <MessageView key={message.id} message={message} onDecide={decide} />
            ))}
          </ul>
        </div>
      </ScrollArea>
      <form className="sticky bottom-0 border-t border-border bg-background pt-3" onSubmit={onSubmit}>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask HQ"
          aria-label="Message"
          rows={1}
          className="max-h-36"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{pending ? "HQ is replying." : "Enter sends. Shift+Enter starts a new line."}</p>
          {pending ? (
            <Button type="button" variant="outline" onClick={() => void chat.stop()}>
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!text.trim()}>
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  );

  if (layout === "drawer") return thread;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-6">
      <div className="hidden lg:block">
        <ConversationList title={title} at={first.fetchedAt} onNew={startNew} />
      </div>
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              Chats
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-full data-[side=left]:sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Chats</SheetTitle>
              <SheetDescription>This chat stays with you.</SheetDescription>
            </SheetHeader>
            <ConversationList title={title} at={first.fetchedAt} onNew={startNew} />
          </SheetContent>
        </Sheet>
      </div>
      {thread}
    </div>
  );
}

function ConversationList({ title, at, onNew }: { title: string; at: number; onNew: () => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onNew}>
        New chat
      </Button>
      <ScrollArea className="min-h-0 flex-1">
        <div aria-current="true" className="rounded-lg bg-muted px-3 py-2">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{formatRelative(at)}</p>
        </div>
      </ScrollArea>
    </div>
  );
}

function Starters({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-2 py-4">
      <p className="text-sm text-muted-foreground">Start with one of these.</p>
      {starterPrompts().map((prompt) => (
        <Button key={prompt} type="button" variant="outline" onClick={() => onPick(prompt)}>
          {prompt}
        </Button>
      ))}
    </div>
  );
}

function MessageView({
  message,
  onDecide,
}: {
  message: UIMessage;
  onDecide: (id: string, approved: boolean) => void;
}) {
  const mine = message.role === "user";
  return (
    <li className={mine ? "ml-auto flex max-w-[85%] flex-col gap-2" : "mr-auto flex max-w-[85%] gap-2"}>
      {mine ? null : (
        <span
          aria-hidden="true"
          className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px]"
        >
          HQ
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            if (!part.text.trim()) return null;
            return (
              <Markdown key={`${message.id}-${index}`} className={mine ? "rounded-lg bg-muted px-3 py-2" : undefined}>
                {part.text}
              </Markdown>
            );
          }
          if (!isToolPart(part)) return null;
          return <ToolCallRow key={`${message.id}-${index}`} part={part} onDecide={onDecide} />;
        })}
      </div>
    </li>
  );
}

function isToolPart(part: UIMessage["parts"][number]): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function partToolName(part: UIMessage["parts"][number]): string {
  if (part.type === "dynamic-tool") return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return "";
}

function ToolCallRow({
  part,
  onDecide,
}: {
  part: UIMessage["parts"][number];
  onDecide: (id: string, approved: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const state = getToolPartState(part);
  if (state === "waiting-approval") {
    const card = approvalCard(part, onDecide);
    if (card) return card;
  }
  const name = partToolName(part);
  const label = HQ_TOOL_HELP[name]?.label ?? (name || "Tool");
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <StatusDot domain="task" value={toolTaskStatus(state)} />
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {open ? (
        <pre className="overflow-x-auto border-t border-border px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {toolDetail(getToolInput(part), getToolOutput(part))}
        </pre>
      ) : null}
    </div>
  );
}

function toolDetail(input: unknown, output: unknown): string {
  const body: Record<string, unknown> = {};
  if (input !== undefined) body.input = stripStack(input);
  if (output !== undefined) body.output = stripStack(output);
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return "";
  }
}

function stripStack(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stripStack(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "stack") continue;
    out[key] = stripStack(child, depth + 1);
  }
  return out;
}
