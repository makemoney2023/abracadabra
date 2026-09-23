import { sweepAbandoned } from "@/lib/assessment/sweep";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

export const assessmentSweepFn = inngest.createFunction(
  {
    id: "assessment-sweep",
    retries: 1,
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    return step.run("abandon-stale-checks", async () => sweepAbandoned(createAdminClient()));
  },
);
