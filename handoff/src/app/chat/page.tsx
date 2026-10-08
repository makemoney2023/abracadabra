import { requireHqStaffPage } from "@/lib/current";
import { StaffShell } from "../staff-shell";
import { ChatPanel } from "./chat-panel";

export default async function ChatPage() {
  await requireHqStaffPage();
  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <h1 className="font-heading text-4xl leading-tight">Chat</h1>
        <ChatPanel />
      </main>
    </StaffShell>
  );
}
