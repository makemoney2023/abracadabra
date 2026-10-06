import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type PullFile = {
  relativePath: string;
  sha256: string | null;
  url?: string;
};

export type PullDocument = {
  files: PullFile[];
};

function destination(targetDir: string, relativePath: string): string | null {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) return null;
  const parts = relativePath.split(/[/\\]/);
  if (parts.some((part) => part === ".." || part.length === 0)) return null;
  const root = path.resolve(targetDir);
  const dest = path.resolve(root, ...parts);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!dest.startsWith(prefix)) return null;
  return dest;
}

async function fileHash(filePath: string): Promise<string | null> {
  try {
    const bytes = await readFile(filePath);
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return null;
  }
}

/** Download each signed file under targetDir and return 0 only when every hash matches. */
export async function pullExport(input: {
  document: PullDocument;
  targetDir: string;
  fetchFile: (url: string) => Promise<Uint8Array>;
}): Promise<number> {
  for (const file of input.document.files) {
    if (!file.url) continue;
    const dest = destination(input.targetDir, file.relativePath);
    if (!dest || !file.sha256) return 1;
    const existing = await fileHash(dest);
    if (existing === file.sha256) continue;
    const bytes = await input.fetchFile(file.url);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    const written = createHash("sha256").update(bytes).digest("hex");
    if (written !== file.sha256) {
      await unlink(dest);
      return 1;
    }
  }
  return 0;
}

async function main(): Promise<void> {
  const [file, dir] = process.argv.slice(2);
  if (!file || !dir) {
    process.exitCode = 1;
    return;
  }
  let document: PullDocument;
  try {
    document = JSON.parse(await readFile(file, "utf8")) as PullDocument;
  } catch {
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(document.files)) {
    process.exitCode = 1;
    return;
  }
  try {
    process.exitCode = await pullExport({
      document,
      targetDir: dir,
      fetchFile: async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("download failed");
        return new Uint8Array(await response.arrayBuffer());
      },
    });
  } catch {
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
