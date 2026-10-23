import { getCloudflareContext } from "@opennextjs/cloudflare";
import { postHqNotice } from "@/lib/agent-wake";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { cloudflareSkillReader } from "@/lib/cloudflare-skills";
import { settleOne } from "@/lib/client-workflows";
import { fluxInput } from "@/lib/flux-input";
import { handleSwarmSettled } from "@/lib/swarm-settled";
import { VISUAL_MODEL } from "@/lib/specialist-pipeline";
import { openObjectStore } from "@/lib/store/objects";

async function fluxRun(): Promise<((prompt: string) => Promise<{ image?: string }>) | undefined> {
  try {
    const env = (await getCloudflareContext({ async: true })).env as {
      AI?: {
        run: (
          model: string,
          body: { multipart: { body: ReadableStream<Uint8Array>; contentType: string } },
        ) => Promise<{ image?: string }>;
      };
    };
    if (!env.AI) return undefined;
    const ai = env.AI;
    return async (prompt) => {
      const image = await ai.run(VISUAL_MODEL, fluxInput(prompt));
      return { image: image.image };
    };
  } catch {
    return undefined;
  }
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const origin = process.env.SWARM_ORIGIN ?? "";
  const readSkill = await cloudflareSkillReader();
  const imageRun = await fluxRun();
  return handleSwarmSettled(request, {
    secret: process.env.SWARM_RUN_SECRET ?? "",
    now,
    settle: (runId) =>
      settleOne({
        sql,
        runId,
        origin,
        now,
        store: openObjectStore(),
        readSkill,
        imageRun,
        notify: async (notice) => {
          await postHqNotice(
            { AGENT_URL: process.env.AGENT_URL, AGENT_WAKE_SECRET: process.env.AGENT_WAKE_SECRET },
            notice.userId,
            notice.detail,
            now,
          );
        },
      }),
  });
}
