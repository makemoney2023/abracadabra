import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAssessmentByToken,
  insertAssessment,
  listAssessmentEvents,
  updateAssessment,
  type AssessmentRow,
} from "./repository";

export function assessmentStore() {
  const admin = createAdminClient();
  return {
    getByToken: (token: string) => getAssessmentByToken(admin, token),
    create: (input: { token: string; configVersion: string; utm: Record<string, unknown>; currentStep: string }) =>
      insertAssessment(admin, input),
    update: (id: string, patch: Record<string, unknown>) => updateAssessment(admin, id, patch),
    listEvents: (id: string) => listAssessmentEvents(admin, id),
    admin,
  };
}

export type { AssessmentRow };
