import { inngest } from "../client";
import { createParallelClient } from "@/lib/parallel/client";
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

    const result = await step.run("findall-enrich-enqueue", async () => {
      const store = createSupabaseProspectStore(createAdminClient());
      return runProspecting(
        {
          parallel: createParallelClient(),
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
