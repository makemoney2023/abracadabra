import { acceptIntake, schemaBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return acceptIntake(request, "schema", schemaBodyReady);
}
