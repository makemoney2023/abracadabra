import { nanoid } from "nanoid";
import { inngest } from "@/inngest/client";

type ScanAdmin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type CreatedScan = {
  id: string;
  token: string;
  status: string;
};

/**
 * Insert a public scan and enqueue `scan/requested`.
 * Does not check the domain rate limit — callers do that first.
 */
export async function createPublicScan(
  admin: ScanAdmin,
  input: { domain: string; origin: string; source?: string },
): Promise<CreatedScan> {
  const publicToken = nanoid(24);
  const { data: scan, error } = await admin
    .from("scans")
    .insert({
      domain: input.domain,
      origin: input.origin,
      source: input.source ?? "public",
      status: "queued",
      public_token: publicToken,
    })
    .select("id, status, public_token")
    .single();

  if (error || !scan) {
    throw new Error(error?.message ?? "Failed to create scan");
  }

  await inngest.send({
    name: "scan/requested",
    data: { scanId: scan.id },
  });

  return { id: scan.id, token: scan.public_token, status: scan.status };
}
