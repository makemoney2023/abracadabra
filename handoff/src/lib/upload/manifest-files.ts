export type DropFile = {
  relativePath: string;
  sizeBytes: number;
  contentType: string;
};

/** Folder picks carry webkitRelativePath. A loose file only has name. */
export function filesFromDrop(
  files: { name: string; webkitRelativePath?: string; size: number; type: string }[],
): DropFile[] {
  return files.map((file) => {
    const folderPath = file.webkitRelativePath?.trim() ?? "";
    const contentType = file.type.trim();
    return {
      relativePath: folderPath.length > 0 ? folderPath : file.name,
      sizeBytes: file.size,
      contentType: contentType.length > 0 ? contentType : "application/octet-stream",
    };
  });
}
