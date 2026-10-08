import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSkillFrontMatter } from "../src/lib/client-documents";
import { packTemplatesFromCatalog } from "../src/lib/pack-templates";
import { readSkillTree } from "../src/lib/skill-tree";

async function main(): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const skillsRoot = path.resolve(here, "../../.cursor/skills");
  const out = path.resolve(here, "../../swarm/src/pack-templates.json");
  const files = await readSkillTree(skillsRoot);
  const catalog = files.flatMap((file) => {
    const front = parseSkillFrontMatter(file.raw);
    if (!front) return [];
    return [{ ...front, path: file.path }];
  });
  const templates = packTemplatesFromCatalog(catalog);
  await writeFile(out, `${JSON.stringify(templates, null, 2)}\n`);
  console.log(`Wrote ${templates.length} pack templates.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
