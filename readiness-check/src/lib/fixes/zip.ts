import JSZip from "jszip";
import type { FixFile } from "./generate-package";

export async function zipFixFiles(
  files: FixFile[],
  folderName: string,
): Promise<Uint8Array> {
  const zip = new JSZip();
  const root = zip.folder(folderName) ?? zip;
  for (const file of files) {
    root.file(file.path, file.content);
  }
  const buffer = await zip.generateAsync({ type: "uint8array" });
  return buffer;
}

export function fixPackageFolderName(domain: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const safe = domain.replace(/[^a-z0-9.-]+/gi, "-").toLowerCase();
  return `aeo-fixes-${safe}-${day}`;
}
