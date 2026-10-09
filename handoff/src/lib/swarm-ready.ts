import { packTemplateId } from "@/lib/pack-templates";

/** The pack stored on a card, or the pack its first skill path names. */
export function templateOnCard(skillsJson: string | null): string | null {
  if (!skillsJson) return null;
  try {
    const parsed = JSON.parse(skillsJson) as { templateId?: unknown; steps?: { path?: unknown }[] };
    if (typeof parsed.templateId === "string" && parsed.templateId.startsWith("pack-")) return parsed.templateId;
    const path = parsed.steps?.[0]?.path;
    return typeof path === "string" ? packTemplateId(path) : null;
  } catch {
    return null;
  }
}

/** Run swarm shows on an open card that has a pack and no swarm already running. */
export function swarmRunReady(input: {
  status: string;
  skillsJson: string | null;
  running: boolean;
}): { ready: boolean; templateId: string | null } {
  const templateId = templateOnCard(input.skillsJson);
  if (!templateId || input.status === "done" || input.running) return { ready: false, templateId };
  return { ready: true, templateId };
}
