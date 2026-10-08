import { requireHqStaffPage } from "@/lib/current";
import { StaffShell } from "../staff-shell";
import { SWARM_ORIGIN } from "../staff-links";

export default async function SwarmPage() {
  await requireHqStaffPage();
  return (
    <StaffShell>
      <iframe title="Swarm" src={SWARM_ORIGIN} className="h-[calc(100svh-3rem)] w-full border-0 bg-background" />
    </StaffShell>
  );
}
