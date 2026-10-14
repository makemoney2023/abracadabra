import { acceptIntake, leadBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

/** BDR agent lead intake. Signed with LEAD_AGENT_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "lead", leadBodyReady);
}
