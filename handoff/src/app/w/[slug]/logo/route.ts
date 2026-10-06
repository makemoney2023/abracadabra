import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { openBranding } from "@/lib/store/branding";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace?.logo_object_key) return new Response(null, { status: 404 });
  const object = await openBranding().get(workspace.logo_object_key);
  if (!object) return new Response(null, { status: 404 });
  return new Response(Buffer.from(object.body), {
    headers: {
      "content-type": object.contentType,
      "cache-control": "private, max-age=60",
    },
  });
}
