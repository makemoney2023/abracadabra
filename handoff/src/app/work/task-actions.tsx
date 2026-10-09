"use client";

import Link from "next/link";
import { useOptimistic } from "react";
import { completeTaskAction } from "@/app/clients/actions";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";

export function TaskActions({
  taskId,
  organizationId,
  href,
}: {
  taskId: string;
  organizationId: string;
  href: string;
}) {
  const [done, setDone] = useOptimistic(false);

  if (done) {
    return <span className="text-sm text-muted-foreground">Done</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <ActionForm
        action={(previous, formData) => {
          setDone(true);
          return completeTaskAction(previous, formData);
        }}
        submitLabel="Done"
        pendingLabel="Done"
        className="w-auto flex-row items-center"
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="taskId" value={taskId} />
      </ActionForm>
      <Button variant="ghost" size="sm" asChild>
        <Link href={href}>Open</Link>
      </Button>
    </div>
  );
}
