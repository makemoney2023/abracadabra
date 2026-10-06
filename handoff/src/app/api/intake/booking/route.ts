import { acceptIntake, bookingBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return acceptIntake(request, "booking", bookingBodyReady);
}
