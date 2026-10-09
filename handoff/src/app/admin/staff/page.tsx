import { workspacesFor } from "@/db/records";
import { requireSuperAdminPage } from "@/lib/current";
import { initials } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { StaffDrawer } from "../staff-form";

type StaffRow = {
  userId: string;
  email: string;
  role: "Admin" | "Staff";
};

function personInitials(email: string): string {
  const local = email.split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
  return local.length > 0 ? initials(local) : "?";
}

const columns: Column<StaffRow>[] = [
  {
    key: "person",
    header: "Person",
    cell: (row) => (
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex size-7 items-center justify-center rounded-full bg-muted font-mono text-[11px]"
        >
          {personInitials(row.email)}
        </span>
        <span>{row.email}</span>
      </span>
    ),
  },
  {
    key: "role",
    header: "Role",
    cell: (row) => <Badge variant={row.role === "Admin" ? "default" : "secondary"}>{row.role}</Badge>,
  },
];

export default async function StaffPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const [workspaces, people] = await Promise.all([
    workspacesFor(sql, caller),
    sql.all<{ user_id: string; email: string; is_super_admin: number }>(
      "SELECT user_id, email, is_super_admin FROM staff WHERE revoked_at IS NULL ORDER BY email",
    ),
  ]);
  const rows: StaffRow[] = people.map((person) => ({
    userId: person.user_id,
    email: person.email,
    role: person.is_super_admin === 1 ? "Admin" : "Staff",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <StaffDrawer
          workspaces={workspaces.map((workspace) => ({
            id: workspace.id,
            displayName: workspace.display_name,
          }))}
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId}
        empty={<EmptyState title="No staff yet." body="Add a person so they can sign in." />}
      />
    </div>
  );
}
