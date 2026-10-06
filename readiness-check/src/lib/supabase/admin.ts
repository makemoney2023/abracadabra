import "server-only";

import { createClient } from "@supabase/supabase-js";
import { workerEnv } from "@/lib/cloudflare";
import { d1Admin, type D1Like } from "@/lib/d1/admin";

export function createAdminClient() {
  const db = workerEnv().DB;
  if (db) return d1Admin(db as D1Like);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    return createClient(url, key, { auth: { persistSession: false } });
  }
  throw new Error("Missing database");
}
