import { PageFrame } from "@/components/page-frame";
import { requireHqStaffPage } from "@/lib/current";
import { StaffShell } from "../staff-shell";
import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  await requireHqStaffPage();
  return (
    <StaffShell>
      <PageFrame
        title="Chat"
        width="wide"
        description="Ask HQ. Notes and tasks from this chat show up on the client record."
      >
        <ChatPanel />
      </PageFrame>
    </StaffShell>
  );
}
