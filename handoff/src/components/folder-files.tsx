"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fileStatusLabel, formatFileSize, groupFolderFiles } from "@/lib/file-label";

export type FolderRow = {
  id: string;
  batchId: string;
  name: string;
  sizeBytes: number;
  status: string;
  moreHref: string | null;
  deletable: boolean;
};

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    return fallback;
  }
  return fallback;
}

function fileCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function FileActions({
  file,
  label,
  pending,
  onDownload,
  onDelete,
}: {
  file: FolderRow;
  label: string;
  pending: boolean;
  onDownload: (file: FolderRow) => void;
  onDelete: (file: FolderRow) => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {fileStatusLabel(file.status)} · {formatFileSize(file.sizeBytes)}
        </p>
      </div>
      {file.status === "clean" ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onDownload(file)}>
          Download
        </Button>
      ) : null}
      {file.deletable ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onDelete(file)}>
          Delete
        </Button>
      ) : null}
      {file.moreHref ? (
        <Link href={file.moreHref} className="text-sm">
          More
        </Link>
      ) : null}
    </li>
  );
}

export function FolderFiles({ files, slug }: { files: FolderRow[]; slug: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const groups = groupFolderFiles(files);

  async function download(file: FolderRow) {
    setPendingKey(file.id);
    setMessage("");
    const response = await fetch(`/api/batches/${file.batchId}/files/${file.id}/download`);
    if (!response.ok) {
      setMessage(await responseMessage(response, "That download didn't work."));
      setPendingKey(null);
      return;
    }
    const body = (await response.json()) as { url?: string };
    if (!body.url) {
      setMessage("That download didn't work.");
      setPendingKey(null);
      return;
    }
    window.location.assign(body.url);
    setPendingKey(null);
  }

  async function removeFile(file: FolderRow) {
    if (!window.confirm("Delete this file?")) return;
    setPendingKey(file.id);
    setMessage("");
    const response = await fetch(`/api/batches/${file.batchId}/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(await responseMessage(response, "That delete didn't work."));
      setPendingKey(null);
      return;
    }
    setPendingKey(null);
    router.refresh();
  }

  async function removeFolder(name: string) {
    if (!window.confirm("Delete this folder and the files you put in it?")) return;
    setPendingKey(`folder:${name}`);
    setMessage("");
    const response = await fetch(`/api/workspaces/${slug}/folders/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage(await responseMessage(response, "That delete didn't work."));
      setPendingKey(null);
      return;
    }
    setPendingKey(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      <ul className="overflow-hidden rounded-lg border border-border">
        {groups.map((group) =>
          group.kind === "folder" ? (
            <li key={`folder:${group.name}`} className="border-b border-border last:border-b-0">
              <div className="flex items-center gap-3 bg-muted/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{fileCount(group.files.length)}</p>
                </div>
                {group.files.some((file) => file.deletable) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pendingKey === `folder:${group.name}`}
                    onClick={() => void removeFolder(group.name)}
                  >
                    Delete folder
                  </Button>
                ) : null}
              </div>
              <ul>
                {group.files.map((file) => (
                  <FileActions
                    key={file.id}
                    file={file}
                    label={file.name.slice(group.name.length + 1)}
                    pending={pendingKey === file.id}
                    onDownload={(row) => void download(row)}
                    onDelete={(row) => void removeFile(row)}
                  />
                ))}
              </ul>
            </li>
          ) : (
            <FileActions
              key={group.file.id}
              file={group.file}
              label={group.file.name}
              pending={pendingKey === group.file.id}
              onDownload={(row) => void download(row)}
              onDelete={(row) => void removeFile(row)}
            />
          ),
        )}
      </ul>
    </div>
  );
}
