import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireHqSuperAdminPage } from "@/lib/current";
import { portalRuntime } from "@/lib/portal-env";
import { listPortalServers, type PortalServer } from "@/lib/portal-session";
import { StaffShell } from "../staff-shell";
import { togglePortalServerAction } from "./actions";

function ServerRow({ server }: { server: PortalServer }) {
  return (
    <form action={togglePortalServerAction} className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{server.name}</div>
        <div className="font-mono text-xs text-muted-foreground">{server.serverId}</div>
      </div>
      <input type="hidden" name="serverId" value={server.serverId} />
      <input type="hidden" name="enabled" value={server.enabled ? "false" : "true"} />
      <Button type="submit" variant={server.enabled ? "default" : "outline"} size="sm">
        {server.enabled ? "On" : "Off"}
      </Button>
    </form>
  );
}

export default async function McpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireHqSuperAdminPage();
  const query = await searchParams;
  const runtime = portalRuntime();
  const listed = await listPortalServers(runtime);
  const urlEmpty = !(runtime.MCP_PORTAL_URL ?? "").startsWith("https://");
  return (
    <StaffShell>
      <PageFrame
        title="MCP"
        description="Servers on the agency portal. A switch turns that server on or off for the agent and for swarm runs."
        width="narrow"
      >
        {query.error ? <p className="text-sm text-destructive">{query.error}</p> : null}
        {!listed.ok ? <p className="text-sm text-destructive">{listed.error}</p> : null}
        {listed.ok && !listed.configured && urlEmpty ? <p className="text-sm text-muted-foreground">The portal URL is empty.</p> : null}
        {listed.ok && !listed.configured && !urlEmpty ? <p className="text-sm text-muted-foreground">The portal access token is not set.</p> : null}
        {listed.ok && listed.configured && listed.servers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No servers are visible to the service token.</p>
        ) : null}
        {listed.ok && listed.servers.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Servers</CardTitle>
              <CardDescription>On means the next wake and the next swarm run can call that server.</CardDescription>
            </CardHeader>
            <CardContent>
              {listed.servers.map((server) => (
                <ServerRow key={server.serverId} server={server} />
              ))}
            </CardContent>
          </Card>
        ) : null}
      </PageFrame>
    </StaffShell>
  );
}
