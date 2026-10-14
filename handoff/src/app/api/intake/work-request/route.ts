import { acceptIntake } from "@/lib/intake/accept";
import { workRequestBodyReady } from "@/lib/client-work";

export const dynamic = "force-dynamic";

/** Client Services work request from an existing client's email. Signed with CLIENT_SERVICES_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "work_request", workRequestBodyReady);
}
