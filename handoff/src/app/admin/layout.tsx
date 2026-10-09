import { PageFrame } from "@/components/page-frame";
import { StaffShell } from "../staff-shell";
import { SpacesTabs } from "./spaces-tabs";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffShell>
      <PageFrame
        title="Spaces"
        description="Each space has its own name and a storage limit."
        width="wide"
      >
        <SpacesTabs />
        {children}
      </PageFrame>
    </StaffShell>
  );
}
