import { listAgentSocialPosts, parseSocialInstant } from "@/lib/social-queries";
import { agentSocialSession, clientOf, socialResponse, unauthorized } from "../http";

export const dynamic = "force-dynamic";

/** Scheduled, published, failed, and draft posts. Paginate with limit and offset. Filter with from and to. */
export async function GET(request: Request) {
  const { sql, agent } = await agentSocialSession(request);
  if (!agent) return unauthorized();
  const url = new URL(request.url);
  const from = parseSocialInstant(url.searchParams.get("from"));
  const to = parseSocialInstant(url.searchParams.get("to"));
  if (url.searchParams.get("from") && from == null) {
    return socialResponse({ ok: false, status: 400, reasonCode: "invalid_range", message: "from must be a time." });
  }
  if (url.searchParams.get("to") && to == null) {
    return socialResponse({ ok: false, status: 400, reasonCode: "invalid_range", message: "to must be a time." });
  }
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return socialResponse(
    await listAgentSocialPosts(sql, agent, {
      client: clientOf(request),
      status: url.searchParams.get("status"),
      from,
      to,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
  );
}
