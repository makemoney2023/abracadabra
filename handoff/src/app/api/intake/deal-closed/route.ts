import { acceptIntake, dealClosedBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

/** Sales Outbound won-deal intake. Signed with OUTREACH_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "deal_closed", dealClosedBodyReady);
}
