import { deliverCompletedAssessment } from "@/lib/handoff-intake";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "../client";

export const assessmentCompletedFn = inngest.createFunction(
  {
    id: "assessment-completed",
    retries: 1,
    triggers: [{ event: "assessment/completed" }],
  },
  async ({ event }) => {
    const { assessmentId } = event.data as { assessmentId: string };
    await deliverCompletedAssessment(createAdminClient(), assessmentId);
    return { assessmentId };
  },
);
