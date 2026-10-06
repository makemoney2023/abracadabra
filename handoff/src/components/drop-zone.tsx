"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LIMITS } from "@/lib/policy/limits";
import { cn } from "@/lib/utils";
import { filesFromDrop } from "@/lib/upload/manifest-files";
import { mapPool, partRanges, sendParts } from "@/lib/upload/transfer";

type RowState = "waiting" | "uploading" | "uploaded" | "failed";

type DropRow = {
  relativePath: string;
  sizeBytes: number;
  contentType: string;
  fileId: string | null;
  state: RowState;
  message: string;
};

function bytesAsArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function rowWord(state: RowState): string {
  if (state === "uploading") return "Sending";
  if (state === "uploaded") return "Done";
  if (state === "failed") return "Didn't work";
  return "Ready to send";
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    return "That upload didn't work.";
  }
  return "That upload didn't work.";
}

async function uploadFile(batchId: string, fileId: string, file: File): Promise<void> {
  const granted = await fetch(`/api/batches/${batchId}/files/${fileId}/grant`, { method: "POST" });
  if (!granted.ok) throw new Error(await responseMessage(granted));
  const ranges = partRanges(file.size, LIMITS.partSizeBytes);
  const created = await fetch(`/api/batches/${batchId}/files/${fileId}/multipart`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "create", partCount: ranges.length }),
  });
  if (!created.ok) throw new Error(await responseMessage(created));
  const payload = (await created.json()) as {
    uploadId: string;
    parts: { partNumber: number; url: string }[];
  };
  const urlByPart = new Map(payload.parts.map((part) => [part.partNumber, part.url]));
  await sendParts({
    ranges,
    concurrency: LIMITS.uploadConcurrency,
    read: async (start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer()),
    send: async (partNumber, body) => {
      const url = urlByPart.get(partNumber);
      if (!url) throw new Error("A piece of the file is missing.");
      const sent = await fetch(url, { method: "PUT", body: bytesAsArrayBuffer(body) });
      if (!sent.ok) throw new Error(await responseMessage(sent));
    },
  });
  const finished = await fetch(`/api/batches/${batchId}/files/${fileId}/multipart`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "finish", uploadId: payload.uploadId }),
  });
  if (!finished.ok) throw new Error(await responseMessage(finished));
  const done = await fetch(`/api/batches/${batchId}/files/${fileId}/complete`, { method: "POST" });
  if (!done.ok) throw new Error(await responseMessage(done));
  const completed = (await done.json()) as { file?: { status: string } };
  if (completed.file?.status !== "uploaded") throw new Error("That file didn't finish uploading.");
}

export function DropZone({
  slug,
  requestId,
  canDrop,
}: {
  slug: string;
  requestId: string;
  canDrop: boolean;
}) {
  const folderRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(new Map<string, File>());
  const [rows, setRows] = useState<DropRow[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    if (!busy) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [busy]);

  function remember(list: FileList | null) {
    const selected = list ? Array.from(list) : [];
    const listed = filesFromDrop(selected);
    filesRef.current = new Map(
      selected.map((file, index) => [listed[index]?.relativePath ?? file.name, file]),
    );
    setBatchId(null);
    setRows(
      listed.map((file) => ({
        ...file,
        fileId: null,
        state: "waiting",
        message: "",
      })),
    );
    setFormMessage("");
  }

  function patch(relativePath: string, next: Partial<DropRow>) {
    setRows((current) =>
      current.map((row) => (row.relativePath === relativePath ? { ...row, ...next } : row)),
    );
  }

  async function sendRows(currentBatchId: string, targets: DropRow[]) {
    await mapPool(targets, LIMITS.uploadConcurrency, async (row) => {
      const file = filesRef.current.get(row.relativePath);
      if (!file || !row.fileId) {
        patch(row.relativePath, { state: "failed", message: "That file isn't picked anymore." });
        return;
      }
      patch(row.relativePath, { state: "uploading", message: "" });
      try {
        await uploadFile(currentBatchId, row.fileId, file);
        patch(row.relativePath, { state: "uploaded", message: "" });
      } catch (error) {
        patch(row.relativePath, {
          state: "failed",
          message: error instanceof Error ? error.message : "That upload didn't work.",
        });
      }
    });
  }

  async function startUpload() {
    if (!canDrop || busy || rows.length === 0) return;
    setBusy(true);
    setFormMessage("");
    try {
      let currentBatchId = batchId;
      let targets = rows.filter((row) => row.state !== "uploaded");
      if (!currentBatchId) {
        const response = await fetch(`/api/workspaces/${slug}/batches`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            files: rows.map((row) => ({
              relativePath: row.relativePath,
              sizeBytes: row.sizeBytes,
              contentType: row.contentType,
            })),
            requestId,
            label: null,
            note: null,
          }),
        });
        if (!response.ok) {
          setFormMessage(await responseMessage(response));
          return;
        }
        const created = (await response.json()) as {
          batchId: string;
          files: { id: string; relativePath: string }[];
        };
        currentBatchId = created.batchId;
        setBatchId(created.batchId);
        const idByPath = new Map(created.files.map((file) => [file.relativePath, file.id]));
        targets = rows.map((row) => ({ ...row, fileId: idByPath.get(row.relativePath) ?? null }));
        setRows(targets);
      }
      await sendRows(
        currentBatchId,
        targets.filter((row) => row.state !== "uploaded"),
      );
    } finally {
      setBusy(false);
    }
  }

  const finished = rows.filter((row) => row.state === "uploaded").length;
  const failed = rows.filter((row) => row.state === "failed").length;
  const remaining = rows.length - finished - failed;

  return (
    <section className="flex flex-col gap-4">
      {canDrop ? (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              remember(event.dataTransfer.files);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center",
              over && "bg-muted",
            )}
          >
            <p className="text-lg">Drop files here</p>
            <p className="text-sm text-muted-foreground">or choose them from your computer</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => filesInputRef.current?.click()}>
                Choose files
              </Button>
              <Button type="button" variant="outline" onClick={() => folderRef.current?.click()}>
                Choose a folder
              </Button>
            </div>
            <input
              ref={filesInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => remember(event.target.files)}
            />
            <input
              ref={folderRef}
              type="file"
              className="hidden"
              onChange={(event) => remember(event.target.files)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            On a phone, pick a few files. To send a whole folder, use a computer.{" "}
            <a href="/how-handoff-handles-files" className="underline">
              How we keep your files safe
            </a>
          </p>
          {rows.length > 0 ? (
            <>
              <ul className="flex flex-col gap-1 text-sm">
                {rows.map((row) => (
                  <li key={row.relativePath}>
                    {row.relativePath} · {rowWord(row.state)}
                    {row.message ? ` · ${row.message}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-sm">
                {finished} done, {failed} didn&apos;t work, {remaining} to go
              </p>
            </>
          ) : null}
          {formMessage ? <p className="text-sm">{formMessage}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy || rows.length === 0} onClick={() => void startUpload()}>
              Upload
            </Button>
            {failed > 0 && batchId ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void startUpload()}>
                Try the missed files again
              </Button>
            ) : null}
            {batchId ? (
              <Link href={`/w/${slug}`} className="text-sm">
                See your files
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">You can look, but only people in the folder can upload.</p>
      )}
    </section>
  );
}
