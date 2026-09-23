import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { assessmentCompletedFn } from "@/inngest/functions/assessment-completed";
import { assessmentSweepFn } from "@/inngest/functions/assessment-sweep";
import { runProspectFn } from "@/inngest/functions/run-prospect";
import { runScanFn } from "@/inngest/functions/run-scan";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runScanFn, runProspectFn, assessmentCompletedFn, assessmentSweepFn],
});

