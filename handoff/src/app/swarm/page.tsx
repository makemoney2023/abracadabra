import { PageFrame } from "@/components/page-frame";
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
  return (
    <StaffShell>
      <PageFrame title="Swarm" description="The agent swarm, in this window." width="wide">
        <SwarmFrame origin={SWARM_ORIGIN} executionId={executionId} />
      </PageFrame>
    </StaffShell>
  );
}
