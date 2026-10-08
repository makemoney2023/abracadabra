"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ChatPageContext } from "@/lib/hq-chat-context";
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

export function ChatPanel({ context }: { context?: ChatPageContext }) {
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
  return <LiveChat first={session} context={context} />;
}

function LiveChat({ first, context }: { first: Session; context?: ChatPageContext }) {
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
  function send(event: FormEvent) {
    event.preventDefault();
    const next = text.trim();
    if (!next) return;
    void chat.sendMessage({ text: next });
    setText("");
  }
  const decide = (id: string, approved: boolean) => {
    void chat.addToolApprovalResponse({ id, approved });
  };
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex flex-col gap-4">
        {chat.connectionError ? (
          <p className="text-sm text-destructive">Chat lost its connection. Reload the page to sign in again.</p>
        ) : null}
        {chat.error ? <p className="text-sm text-destructive">{chat.error.message}</p> : null}
        <ul className="flex flex-col gap-3">
          {chat.messages.map((message) => (
            <li key={message.id} className="text-sm">
              {message.parts?.map((part, index) => {
                if (part.type === "text") return <p key={`${message.id}-${index}`}>{part.text}</p>;
                return <div key={`${message.id}-${index}`}>{approvalCard(part, decide)}</div>;
              })}
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={send}>
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask HQ" />
          <Button type="submit" disabled={chat.status === "streaming" || chat.status === "submitted"}>
            Send
          </Button>
        </form>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>This thread</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Notes and tasks from this chat show up on the client record.</p>
        </CardContent>
      </Card>
    </div>
  );
}
