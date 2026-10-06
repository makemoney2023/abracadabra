"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LIMITS } from "@/lib/policy/limits";
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

const NOTICE =
  "Send brand files, photos, words, and notes. We can't take passwords or key files.";

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
  const filesRef = useRef(new Map<string, File>());
  const [rows, setRows] = useState<DropRow[]>([]);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (note.length > LIMITS.maxNoteChars) return;
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
            label: label.trim().length > 0 ? label.trim() : null,
            note: note.trim().length > 0 ? note.trim() : null,
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
  const noteTooLong = note.length > LIMITS.maxNoteChars;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm">{NOTICE}</p>
      <a href="/how-handoff-handles-files" className="text-sm underline">
        How we keep your files safe
      </a>
      {canDrop ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Name this upload
            <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={200} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Add a note (if you want)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
            />
          </label>
          {noteTooLong ? <p className="text-sm">Your note is too long. Keep it under 2,000 characters.</p> : null}
          <label className="flex flex-col gap-1 text-sm">
            Pick a folder
            <input
              ref={folderRef}
              type="file"
              className="text-sm"
              onChange={(event) => remember(event.target.files)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Pick files
            <input
              type="file"
              multiple
              className="text-sm"
              onChange={(event) => remember(event.target.files)}
            />
          </label>
          <p className="text-sm text-muted-foreground">
            On a phone, you can pick a few files. To send a whole folder, use a computer.
          </p>
          {rows.length > 0 ? (
            <>
              <ul className="flex flex-col gap-1 font-mono text-xs">
                {rows.map((row) => (
                  <li key={row.relativePath}>
                    {row.relativePath} · {row.state}
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
          <div className="flex gap-2">
            <Button type="button" disabled={busy || rows.length === 0 || noteTooLong} onClick={() => void startUpload()}>
              Send
            </Button>
            {failed > 0 && batchId ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void startUpload()}>
                Try the missed files again
              </Button>
            ) : null}
            {batchId ? (
              <Link href={`/w/${slug}/batches/${batchId}`} className="text-sm">
                See this upload
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Staff can&apos;t send files.</p>
      )}
    </section>
  );
}
