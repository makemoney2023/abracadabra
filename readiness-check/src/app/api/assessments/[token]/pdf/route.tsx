import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { readAssessment } from "@/lib/assessment/actions";
import { addAssessmentEvent, getAssessmentByToken } from "@/lib/assessment/repository";
import { AssessmentReportDocument } from "@/lib/pdf/assessment-report";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const admin = createAdminClient();
  const row = await getAssessmentByToken(admin, token).catch(() => null);
  if (!row) return NextResponse.json({ error: "Check not found" }, { status: 404 });
  if (!row.optedInAt) {
    return NextResponse.json({ error: "Unlock required", message: "Request the report before download" }, { status: 403 });
  }
  const payload = await readAssessment(admin, token);
  if (!payload?.results) {
    return NextResponse.json({ error: "Report is not ready" }, { status: 409 });
  }
  const buffer = await renderToBuffer(<AssessmentReportDocument results={payload.results} />);
  await addAssessmentEvent(admin, row.id, "pdf_downloaded", {}).catch(() => undefined);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="readiness-check.pdf"`,
    },
  });
}
