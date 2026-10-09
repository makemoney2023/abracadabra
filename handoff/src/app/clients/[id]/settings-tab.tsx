import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MergeForm } from "../activity-forms";
import { saveSearchConsoleGrantAction } from "../actions";

export function SettingsTab({
  keepId,
  others,
  searchConsoleResource,
}: {
  keepId: string;
  others: { id: string; name: string }[];
  searchConsoleResource: string;
}) {
  return (
    <div className="flex flex-col gap-6">
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
