import { acceptIntake, enrichmentBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

/** Account Research enrichment intake. Signed with ENRICHMENT_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "enrichment", enrichmentBodyReady);
}
