import { handleMcpRequest } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
