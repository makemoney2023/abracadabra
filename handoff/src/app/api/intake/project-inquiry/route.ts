import { acceptIntake, projectInquiryBodyReady } from "@/lib/intake/accept";

export const dynamic = "force-dynamic";

/** Website /start/ form, forwarded by the abracadabra-marketing worker. Signed with PROJECT_INQUIRY_SIGNING_SECRET. */
export async function POST(request: Request) {
  return acceptIntake(request, "project_inquiry", projectInquiryBodyReady);
}
