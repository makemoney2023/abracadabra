/** Server configuration that must be present before a production process stays up. */
export const PRODUCTION_SECRET_KEYS = ["RESEND_API_KEY"] as const;

export type ProductionSecretKey = (typeof PRODUCTION_SECRET_KEYS)[number];

export function missingProductionSecrets(
  env: Record<string, string | undefined>,
): ProductionSecretKey[] {
  if (env.NODE_ENV !== "production") return [];
  return PRODUCTION_SECRET_KEYS.filter((key) => !env[key]?.trim());
}

export function assertProductionEnv(
  env: Record<string, string | undefined>,
): void {
  const missing = missingProductionSecrets(env);
  if (missing.length === 0) return;
  throw new Error(`Missing production configuration: ${missing.join(", ")}`);
}
