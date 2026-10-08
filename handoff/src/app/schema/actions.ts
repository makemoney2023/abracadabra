"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { redirect } from "next/navigation";
import { requireHqStaffPage } from "@/lib/current";

export type SchemaFormState = { message: string };

const CHECK_JOBS = "https://check.abra-ca-dabra.app/api/internal/jobs";

export async function startSchemaCheck(_previous: SchemaFormState, formData: FormData): Promise<SchemaFormState> {
  const { sql } = await requireHqStaffPage();
  const objective = String(formData.get("objective") ?? "").trim();
  if (objective.length < 8 || objective.length > 2000) {
    return { message: "Name at least one site." };
  }
  const cloudflare = (await getCloudflareContext({ async: true })).env as { CLOUDFLARE_API_TOKEN?: string };
  const token = cloudflare.CLOUDFLARE_API_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (!token) return { message: "Cloudflare is not configured on HQ." };
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO schema_checks (id, objective, status, created_at) VALUES (?, ?, 'queued', ?)",
    [id, objective, Date.now()],
  );
  let response: Response;
  try {
    response = await fetch(CHECK_JOBS, {
      method: "POST",
      headers: { "content-type": "application/json", "x-job-token": token },
      body: JSON.stringify({ type: "prospect", objective, checkId: id }),
    });
  } catch {
    return { message: "The schema check could not be reached." };
  }
  if (!response.ok) {
    const detail = await response.text();
    return { message: detail.slice(0, 180) || "The schema check did not finish." };
  }
  redirect(`/schema?check=${id}`);
}
