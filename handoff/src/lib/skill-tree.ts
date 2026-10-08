import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** Every SKILL.md under root, except the org pack. Paths are relative and use slashes. */
export async function readSkillTree(root: string): Promise<{ path: string; raw: string }[]> {
  const files: { path: string; raw: string }[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name !== "SKILL.md") continue;
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (relative.startsWith("org/")) continue;
      files.push({ path: relative, raw: await readFile(full, "utf8") });
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
