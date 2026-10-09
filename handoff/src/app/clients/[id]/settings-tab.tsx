import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MergeForm } from "../activity-forms";

export function SettingsTab({
  keepId,
  others,
}: {
  keepId: string;
  others: { id: string; name: string }[];
}) {
  return (
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
  );
}
