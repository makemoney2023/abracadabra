import { PageFrame } from "@/components/page-frame";
import { StaffShell } from "../staff-shell";
import { SettingsTabs } from "./settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffShell>
      <PageFrame
        title="Settings"
        description="Connect GitHub, see the shortcuts, and pick how tight the rows are."
        width="narrow"
      >
        <SettingsTabs />
        {children}
      </PageFrame>
    </StaffShell>
  );
}
