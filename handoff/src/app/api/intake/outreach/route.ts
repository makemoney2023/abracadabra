import { acceptIntake, outreachBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

/** Sales Outbound outreach intake. Signed with OUTREACH_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "outreach", outreachBodyReady);
}
