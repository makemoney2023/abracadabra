"use client";

import Link from "next/link";
import type { WorkspaceLink } from "@/db/crm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClientChat } from "../client-chat";
import { TaskForm } from "../activity-forms";
import { LinkSpaceForm } from "../link-space-form";
import { tabHref } from "./tabs";

export function ClientActions({
  organizationId,
  spaces,
}: {
  organizationId: string;
  spaces: WorkspaceLink[];
}) {
  return (
    <>
      <ClientChat organizationId={organizationId} />
      <TaskForm organizationId={organizationId} label="New task" />
      <LinkSpaceForm organizationId={organizationId} spaces={spaces} label="Link space" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">More</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={tabHref(organizationId, "settings")}>Merge</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
