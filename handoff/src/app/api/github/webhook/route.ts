import { NextResponse } from "next/server";
import { acceptGithubWebhook } from "@/lib/github/accept";
import { isHqHost } from "@/lib/host";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const host = request.headers.get("host") ?? "";
  if (!isHqHost(host)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return acceptGithubWebhook(request);
}
