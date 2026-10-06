import { cookies } from "next/headers";
import { OPS_COOKIE, verifyOpsCookie } from "@/lib/ops/session";

export type OpsSession =
  | {
      ok: true;
      user: { id: string; email?: string };
      supabase: Record<string, never>;
    }
  | { ok: false; status: 401 | 403; error: string };

/** Require the signed ops cookie. Fail closed when the password is unset. */
export async function requireOpsSession(): Promise<OpsSession> {
  const password = process.env.CHECK_OPS_PASSWORD ?? "";
  if (!password) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const token = (await cookies()).get(OPS_COOKIE)?.value;
  const valid = await verifyOpsCookie(token, password);
  if (!valid) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, user: { id: "ops" }, supabase: {} };
}
