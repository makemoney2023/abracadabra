"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ChatPanel } from "../chat/chat-panel";

export function ClientChat({ organizationId }: { organizationId: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Message
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Chat</SheetTitle>
          <SheetDescription>Tasks and brief changes from this chat show up on this client.</SheetDescription>
        </SheetHeader>
        <ChatPanel context={{ organizationId }} layout="drawer" />
      </SheetContent>
    </Sheet>
  );
}
