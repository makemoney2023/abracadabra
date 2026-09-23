import { inngest } from "../client";

export const assessmentCompletedFn = inngest.createFunction(
  {
    id: "assessment-completed",
    retries: 1,
    triggers: [{ event: "assessment/completed" }],
  },
  async ({ event }) => {
    const { assessmentId } = event.data as { assessmentId: string };
    console.info("assessment completed", assessmentId);
    return { assessmentId };
  },
);
