import { postHqNotice } from "@/lib/agent-wake";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { settleOne } from "@/lib/client-workflows";
import { handleSwarmSettled } from "@/lib/swarm-settled";
import { openObjectStore } from "@/lib/store/objects";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sql = await openHandoffDb();
  await migrate(sql);
  const now = Date.now();
  const origin = process.env.SWARM_ORIGIN ?? "";
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
