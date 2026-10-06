import { acceptIntake, assessmentBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return acceptIntake(request, "assessment", assessmentBodyReady);
}
