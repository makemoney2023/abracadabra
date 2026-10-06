"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { mintKeyAction, readSpaceAction } from "./knowledge-actions";

const STATUS_WORD: Record<string, string> = {
  waiting: "Waiting",
  ready: "Read",
  skipped: "Skipped",
  failed: "Could not read",
};

export function KnowledgeTools({
  slug,
  reads,
}: {
  slug: string;
  reads: { name: string; status: string }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<"read" | "key" | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const snippet =
    token && origin
      ? JSON.stringify(
          {
            mcpServers: {
              handoff: {
                url: `${origin}/api/mcp`,
                headers: { Authorization: `Bearer ${token}` },
              },
            },
          },
          null,
          2,
        )
      : "";

  async function readFiles() {
    setPending("read");
    setMessage("");
    const result = await readSpaceAction(slug);
    setMessage(result.message);
    setPending(null);
    router.refresh();
  }

  async function makeKey() {
    setPending("key");
    setMessage("");
    setCopied(false);
    const result = await mintKeyAction(slug);
    setMessage(result.message);
    setToken(result.token);
    setPending(null);
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border px-4 py-4">
      <p className="text-sm">Read the words in these files so a project can ask about them.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void readFiles()}>
          {pending === "read" ? "Reading" : "Read files"}
        </Button>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void makeKey()}>
          {pending === "key" ? "Making a key" : "Make a project key"}
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {reads.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {reads.map((row) => (
            <li key={row.name}>
              {row.name} · {STATUS_WORD[row.status] ?? row.status}
            </li>
          ))}
        </ul>
      ) : null}
      {token ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            A project uses this key to ask about the files in this space. Copy it now. We will not show it again.
          </p>
          <input
            readOnly
            value={token}
            aria-label="Project key"
            className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
            onFocus={(event) => event.currentTarget.select()}
          />
          {snippet ? (
            <>
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">{snippet}</pre>
              <Button type="button" variant="outline" onClick={() => void copySnippet()}>
                {copied ? "Copied" : "Copy project setup"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
