"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  Globe,
  Palette,
  PenTool,
  Presentation,
  Ruler,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { baseName, buildFolderTree, displayPath, fileStatusLabel, formatFileSize, type FolderNode } from "@/lib/file-label";
import { fileType, thumbnailable, type FileTypeKind } from "@/lib/file-type";

export type FolderRow = {
  id: string;
  batchId: string;
  name: string;
  sizeBytes: number;
  status: string;
  moreHref: string | null;
  previewHref: string | null;
  deletable: boolean;
  /** Agent work waiting on Client Services. Only staff see these rows. */
  held?: boolean;
};

const ICONS: Record<FileTypeKind, LucideIcon> = {
  image: FileImage,
  vector: PenTool,
  design: Palette,
  video: FileVideo,
  pdf: FileText,
  markdown: FileText,
  html: Globe,
  text: FileText,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  slides: Presentation,
  data: FileBraces,
  code: FileCode,
  font: FileType,
  archive: FileArchive,
  cad: Ruler,
  other: File,
};

/** A little colour per family so a list of mixed files scans quickly. Brand accents only. */
const TINT: Partial<Record<FileTypeKind, string>> = {
  image: "text-optic",
  vector: "text-optic",
  video: "text-optic",
  pdf: "text-status-late",
  spreadsheet: "text-phosphor",
  data: "text-phosphor",
  html: "text-optic",
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

function TypeTile({ file }: { file: FolderRow }) {
  const type = fileType(file.name);
  const Icon = ICONS[type.kind];
  const thumb = file.previewHref && thumbnailable(file.name) ? `/api/files/${file.id}/preview` : null;
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40"
      aria-hidden="true"
    >
      {thumb ? (
        // A session-only preview of the stored picture. Lazy, and only fetched once its folder is open.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <Icon className={`size-5 ${TINT[type.kind] ?? "text-muted-foreground"}`} strokeWidth={1.75} />
      )}
    </div>
  );
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
  const type = fileType(file.name);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
      <TypeTile file={file} />
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium" title={label}>
          {label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-mono text-[0.6875rem] tracking-wide" data-file-type={type.kind}>
            {type.extension ? `${type.label} · ${type.extension}` : type.label}
          </Badge>
          <span>
            {fileStatusLabel(file.status)} · {formatFileSize(file.sizeBytes)}
          </span>
          {file.held ? (
            <Badge variant="secondary" className="gap-1">
              <Clock aria-hidden="true" />
              Waiting on Client Services
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {file.previewHref ? (
          <Link href={file.previewHref} className="text-sm">
            Preview
          </Link>
        ) : null}
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
      </div>
    </li>
  );
}

function hasDeletable(node: FolderNode<FolderRow>): boolean {
  return node.files.some((file) => file.deletable) || node.folders.some(hasDeletable);
}

export function FolderFiles({ files, slug }: { files: FolderRow[]; slug: string }) {
  const router = useRouter();
  const list = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const tree = buildFolderTree(files, (file) => displayPath(file.name));

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

  function setAll(open: boolean) {
    list.current?.querySelectorAll("details").forEach((details) => {
      details.open = open;
    });
  }

  const row = (file: FolderRow) => (
    <FileActions
      key={file.id}
      file={file}
      label={baseName(displayPath(file.name))}
      pending={pendingKey === file.id}
      onDownload={(picked) => void download(picked)}
      onDelete={(picked) => void removeFile(picked)}
    />
  );

  function folder(node: FolderNode<FolderRow>, depth: number) {
    // Only a top-level folder of your own uploads can be deleted in one go.
    const deletable = depth === 0 && hasDeletable(node);
    return (
      <li key={`folder:${node.path}`} className="border-b border-border last:border-b-0">
        <details className="group/folder">
          <summary
            className="flex cursor-pointer list-none items-center gap-3 bg-muted/40 px-4 py-3 hover:bg-muted/60 [&::-webkit-details-marker]:hidden"
            style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
          >
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open/folder:rotate-90"
            />
            <Folder aria-hidden="true" className="size-4 shrink-0 text-optic" strokeWidth={1.75} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={node.path}>
                {node.name}
              </p>
              {depth > 0 ? <p className="truncate text-xs text-muted-foreground">{node.path.split("/").join(" / ")}</p> : null}
            </div>
            <Badge variant="outline" className="font-mono text-[0.6875rem]">
              {fileCount(node.count)}
            </Badge>
            {deletable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pendingKey === `folder:${node.name}`}
                onClick={(event) => {
                  event.preventDefault();
                  void removeFolder(node.name);
                }}
              >
                Delete folder
              </Button>
            ) : null}
          </summary>
          <ul className="border-t border-border" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {node.folders.map((child) => folder(child, depth + 1))}
            {node.files.map(row)}
          </ul>
        </details>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-3" ref={list}>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {tree.folders.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>
            {fileCount(tree.count)} in {tree.folders.length === 1 ? "1 folder" : `${tree.folders.length} folders`}
            {tree.files.length ? ` and ${tree.files.length} loose` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAll(true)}>
              Open all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAll(false)}>
              Close all
            </Button>
          </div>
        </div>
      ) : null}
      <ul className="overflow-hidden rounded-lg border border-border">
        {tree.folders.map((node) => folder(node, 0))}
        {tree.files.map(row)}
      </ul>
    </div>
  );
}
