import type { PendingWorkRequest } from "@/lib/client-work";
import { approveClientRequestAction, declineClientRequestAction } from "./client-request-actions";

const REASONS: Record<string, string> = {
  unknown_client: "Unknown client. Enter the organization id.",
  ambiguous_project: "More than one open project fits. Pick one, or leave blank for a new project.",
  project_hint_not_open: "The project hint is not an open project for this client.",
  over_size_threshold: "Over the auto-start size. Confirm before the agent starts.",
};

/** Client Services requests held for staff approval. */
export function ClientRequests({ rows }: { rows: PendingWorkRequest[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2 rounded-md border p-3">
      <h2 className="text-sm font-medium">Client requests needing approval · {rows.length}</h2>
      {rows.map((row) => (
        <div key={row.id} className="space-y-1 border-t pt-2 text-sm">
          <div className="font-medium">{row.subject}</div>
          <div className="text-muted-foreground">
            {row.organization_name ?? row.client_domain ?? row.client_email ?? "Unknown client"}
            {row.deadline ? ` · due ${row.deadline}` : ""}
            {row.estimate_hours != null ? ` · ~${row.estimate_hours}h` : ""}
          </div>
          <div className="text-muted-foreground">{REASONS[row.approval_reason ?? ""] ?? row.approval_reason}</div>
          <p className="line-clamp-3 whitespace-pre-wrap">{row.brief}</p>
          <div className="flex flex-wrap gap-2">
            <form action={approveClientRequestAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={row.id} />
              {row.organization_id ? null : (
                <input name="organizationId" placeholder="Organization id" className="rounded border px-2 py-1" />
              )}
              <input name="projectId" placeholder="Project id, or new" defaultValue={row.project_id ?? ""} className="rounded border px-2 py-1" />
              <button type="submit" className="rounded border px-2 py-1 font-medium">Approve and start</button>
            </form>
            <form action={declineClientRequestAction}>
              <input type="hidden" name="id" value={row.id} />
              <button type="submit" className="rounded border px-2 py-1 text-muted-foreground">Decline</button>
            </form>
          </div>
        </div>
      ))}
    </section>
  );
}
