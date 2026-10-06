"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FILE_TAGS } from "@/lib/policy/limits";
import type { BatchScreenFile } from "@/lib/downloads";

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    return "Handoff could not finish that.";
  }
  return "Handoff could not finish that.";
}

export function BatchReview({
  batchId,
  files,
  canTag,
  canDiscard,
  discardNote,
}: {
  batchId: string;
  files: BatchScreenFile[];
  canTag: boolean;
  canDiscard: boolean;
  discardNote: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function download(fileId: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/batches/${batchId}/files/${fileId}/download`);
    if (!response.ok) {
      setMessage(await responseMessage(response));
      setPending(false);
      return;
    }
    const body = (await response.json()) as { url?: string };
    if (!body.url) {
      setMessage("Handoff could not finish that.");
      setPending(false);
      return;
    }
    window.location.assign(body.url);
  }

  async function saveTag(fileId: string, tag: string) {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/batches/${batchId}/files/${fileId}/tag`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    setMessage(response.ok ? "Tag saved." : await responseMessage(response));
    setPending(false);
    if (response.ok) router.refresh();
  }

  async function discard() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/batches/${batchId}/discard`, { method: "POST" });
    setMessage(response.ok ? "Batch discarded." : await responseMessage(response));
    setPending(false);
    if (response.ok) router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">This batch has no files.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-1 border-b border-border pb-4">
              <p
                className="font-mono text-sm"
                style={{ paddingLeft: `${(file.relativePath.split("/").length - 1) * 12}px` }}
              >
                {file.relativePath}
              </p>
              <p className="text-sm text-muted-foreground">
                {file.sizeBytes} bytes · {file.status}
                {file.sha256 ? ` · ${file.sha256}` : ""}
              </p>
              {file.duplicate ? (
                <p className="text-sm">Matches an earlier file</p>
              ) : null}
              {file.status === "clean" ? (
                <Button type="button" disabled={pending} onClick={() => void download(file.id)}>
                  Download
                </Button>
              ) : null}
              {canTag ? (
                <label className="flex flex-col gap-1 text-sm">
                  Tag
                  <select
                    className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    defaultValue={file.tag}
                    aria-label={`Tag for ${file.relativePath}`}
                    onChange={(event) => void saveTag(file.id, event.target.value)}
                  >
                    {FILE_TAGS.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm text-muted-foreground">Tag {file.tag}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {canDiscard ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => void discard()}>
          Discard batch
        </Button>
      ) : null}
      {discardNote ? <p className="text-sm text-muted-foreground">{discardNote}</p> : null}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
