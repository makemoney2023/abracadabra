import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MergeForm } from "../activity-forms";
import { saveSearchConsoleGrantAction, setInternalAction, setUpdateModeAction } from "../actions";

export function SettingsTab({
  keepId,
  others,
  searchConsoleResource,
  internal = false,
  updateMode = "draft",
}: {
  keepId: string;
  others: { id: string; name: string }[];
  searchConsoleResource: string;
  internal?: boolean;
  updateMode?: "draft" | "auto";
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Internal, test, or vendor</CardTitle>
          <CardDescription>
            {internal
              ? "Hidden from Today, the Pipeline panel, and lead counts. Everything else still works."
              : "Shown on Today. Hide it if this is a test, an internal account, or a vendor that emailed us."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setInternalAction} className="flex items-center gap-3">
            <input type="hidden" name="organizationId" value={keepId} />
            <input type="hidden" name="internal" value={internal ? "0" : "1"} />
            <Button type="submit" variant="outline">
              {internal ? "Show on Today" : "Hide from Today"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Client updates on approved work</CardTitle>
          <CardDescription>
            {updateMode === "auto"
              ? "Automatic: when Client Services approves agent work, the client's space members get the \"is ready\" email."
              : "Draft (default): when Client Services approves agent work, it gets a suggested update to draft in magic@ for approval. Nothing is emailed to the client automatically."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setUpdateModeAction} className="flex items-center gap-3">
            <input type="hidden" name="organizationId" value={keepId} />
            <input type="hidden" name="mode" value={updateMode === "auto" ? "draft" : "auto"} />
            <Button type="submit" variant="outline">
              {updateMode === "auto" ? "Switch to draft for approval" : "Switch to automatic email"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Search Console</CardTitle>
          <CardDescription>The Search Console property for this client. Leave it blank to remove the grant.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveSearchConsoleGrantAction} className="flex flex-col gap-3">
            <input type="hidden" name="organizationId" value={keepId} />
            <Input name="resource" defaultValue={searchConsoleResource} placeholder="sc-domain:client.com" aria-label="Search Console property" />
            <Button type="submit">Save property</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Merge</CardTitle>
        </CardHeader>
        <CardContent>
          {others.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other client to merge.</p>
          ) : (
            <MergeForm keepId={keepId} others={others} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
