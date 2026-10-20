import Link from "next/link";
import type { OrgKind } from "@/db/crm";
import type { OrganizationGroup } from "@/db/org-groups";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLIENT_KIND_LABEL } from "./tabs";

function kindLabel(kind: string): string {
  return CLIENT_KIND_LABEL[kind as OrgKind] ?? kind;
}

/** "Part of …" on a child, shown next to the client name. */
export function PartOfLabel({ group }: { group: OrganizationGroup }) {
  if (!group.parent) return null;
  return (
    <span className="text-sm font-normal text-muted-foreground" data-testid="part-of">
      Part of{" "}
      <Link className="underline underline-offset-2 hover:text-foreground" href={`/clients/${group.parent.id}`}>
        {group.parent.name}
      </Link>
    </span>
  );
}

/** "Group companies" on a parent: every company under it, each linking to its own page. */
export function GroupCompanies({ group }: { group: OrganizationGroup }) {
  if (group.children.length === 0) return null;
  return (
    <Card data-testid="group-companies">
      <CardHeader>
        <CardTitle>Group companies</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {group.children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/clients/${child.id}`}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <span className="font-medium">{child.name}</span>
                {child.domain ? <span className="text-muted-foreground">{child.domain}</span> : null}
                <Badge variant="secondary">{kindLabel(child.kind)}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
