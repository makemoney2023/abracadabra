import type { WorkspaceLink } from "@/db/crm";
import { clientSpaceHref } from "@/lib/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkSpaceForm } from "../link-space-form";

export function FilesTab({
  organizationId,
  linked,
  free,
}: {
  organizationId: string;
  linked: WorkspaceLink[];
  free: WorkspaceLink[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Spaces</CardTitle>
        <LinkSpaceForm organizationId={organizationId} spaces={free} label="Link a space" />
      </CardHeader>
      <CardContent>
        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">No space linked yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linked.map((space) => (
              <li key={space.id} className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={clientSpaceHref(space.slug)}>{space.display_name}</a>
                </Button>
                <Badge variant="secondary">{space.slug}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
