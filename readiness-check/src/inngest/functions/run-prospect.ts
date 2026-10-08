import { inngest } from "../client";
import { createAiSearchProspectFinder } from "@/lib/ai-search/prospect";
import {
  createSupabaseProspectStore,
  runProspecting,
} from "@/lib/ops/prospect";
import { createAdminClient } from "@/lib/supabase/admin";

export const runProspectFn = inngest.createFunction(
  {
    id: "run-prospect",
    retries: 2,
    triggers: [{ event: "prospect/requested" }],
  },
  async ({ event, step }) => {
    const { objective } = event.data as { objective: string };

    const result = await step.run("ai-search-qualify-enqueue", async () => {
      const store = createSupabaseProspectStore(createAdminClient());
      return runProspecting(
        {
          finder: createAiSearchProspectFinder(),
          store,
          enqueueScan: async (scanId) => {
            await inngest.send({
              name: "scan/requested",
              data: { scanId },
            });
          },
        },
        objective,
      );
    });

    return result;
  },
);
