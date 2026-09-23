import { QueueTable } from "@/components/ops/QueueTable";

export default function OpsInboxPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Priority queue — low score + contact ranks highest.
        </p>
      </div>
      <QueueTable />
    </div>
  );
}
