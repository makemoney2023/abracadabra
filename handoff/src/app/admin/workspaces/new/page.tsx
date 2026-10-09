import { requireSuperAdminPage } from "@/lib/current";
import { liveTemplates } from "@/lib/store/workspaces";
import { NewWorkspaceForm } from "../../new-workspace-form";

export default async function NewWorkspacePage() {
  const { sql } = await requireSuperAdminPage();
  const templates = await liveTemplates(sql);
  return <NewWorkspaceForm templates={templates} />;
}
