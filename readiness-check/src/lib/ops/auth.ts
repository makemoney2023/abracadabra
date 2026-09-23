import { createClient } from "@/lib/supabase/server";

export type OpsSession =
  | {
      ok: true;
      user: { id: string; email?: string };
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | { ok: false; status: 401 | 403; error: string };

/** Require an authenticated user with staff_profiles.role = ops. */
export async function requireOpsSession(): Promise<OpsSession> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("staff_profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "ops") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email },
    supabase,
  };
}
