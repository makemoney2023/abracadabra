import raw from "./config.v1.json";
import { assessmentConfigSchema, type AssessmentConfig } from "./config-schema";

export const config: AssessmentConfig = assessmentConfigSchema.parse(raw);
export const CONFIG_VERSION = config.meta.version;

export function questionById(id: string, source: AssessmentConfig = config) {
  return source.questions.find((q) => q.id === id);
}
