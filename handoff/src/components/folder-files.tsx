"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fileStatusLabel, formatFileSize } from "@/lib/file-label";

export type FolderRow = {
  id: string;
  batchId: string;
  name: string;
  sizeBytes: number;
  status: string;
  moreHref: string | null;
};

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    return "That download didn't work.";
  }
  return "That download didn't work.";
}

export function FolderFiles({ files }: { files: FolderRow[] }) {
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function download(file: FolderRow) {
    setPendingId(file.id);
    setMessage("");
    const response = await fetch(`/api/batches/${file.batchId}/files/${file.id}/download`);
    if (!response.ok) {
      setMessage(await responseMessage(response));
      setPendingId(null);
      return;
    }
    const body = (await response.json()) as { url?: string };
    if (!body.url) {
      setMessage("That download didn't work.");
      setPendingId(null);
      return;
    }
    window.location.assign(body.url);
    setPendingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      <ul className="overflow-hidden rounded-lg border border-border">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {fileStatusLabel(file.status)} · {formatFileSize(file.sizeBytes)}
              </p>
            </div>
            {file.status === "clean" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pendingId === file.id}
                onClick={() => void download(file)}
              >
                Download
              </Button>
            ) : null}
            {file.moreHref ? (
              <Link href={file.moreHref} className="text-sm">
                More
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
