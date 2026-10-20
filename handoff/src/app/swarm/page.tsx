import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { legacyStartsAllowed } from "@/lib/agent-mode";
import { requireHqStaffPage } from "@/lib/current";
import { StaffShell } from "../staff-shell";
import { SWARM_ORIGIN } from "../staff-links";
import { SwarmFrame } from "./swarm-frame";

export default async function SwarmPage({
  searchParams,
}: {
  searchParams: Promise<{ executionId?: string }>;
}) {
  await requireHqStaffPage();
  const { executionId } = await searchParams;
  if (!legacyStartsAllowed()) {
    // AGENT_MODE=agents: the embedded canvas could start runs, so it is not shown. Runs that already started
    // still finish and file into HQ as before.
    return (
      <StaffShell>
        <PageFrame title="Swarm" description="The old agent swarm is off.">
          <div role="status" className="flex max-w-xl flex-col gap-2 rounded-lg border border-border p-4 text-sm">
            <p>
              AGENT_MODE is agents. New swarm runs are off, and client work goes to each client&apos;s agent. Runs
              that already started still finish and file into HQ.
            </p>
            <p className="text-muted-foreground">
              See <Link href="/agents">Agents</Link> for who has which client, and <Link href="/unfiled">Unfiled work</Link> for
              anything that needs a home.
            </p>
          </div>
        </PageFrame>
      </StaffShell>
    );
  }
  return (
    <StaffShell>
      <PageFrame title="Swarm" description="The agent swarm, in this window." width="wide">
        <SwarmFrame origin={SWARM_ORIGIN} executionId={executionId} />
      </PageFrame>
    </StaffShell>
  );
}
