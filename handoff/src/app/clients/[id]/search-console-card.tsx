import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessCheck, SearchProperty } from "@/lib/search/properties";
import { accessSummary, PROPERTY_STATUS } from "@/lib/search/present";
import { MapSearchPropertyForm, RemoveSearchPropertyForm } from "./search-console-forms";

/** Staff only (client Settings tab). Maps this client's Search Console property and shows HQ's access to it. */
export function SearchConsoleCard({
  organizationId,
  properties,
  access,
  suggestion,
}: {
  organizationId: string;
  properties: SearchProperty[];
  access: AccessCheck | null;
  suggestion: string;
}) {
  const summary = accessSummary(access);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Console data</CardTitle>
        <CardDescription>
          HQ reads Search Console with one read-only Google account. Map the client&apos;s property here, then the client adds
          {access?.clientEmail ? (
            <>
              {" "}
              <code className="rounded bg-muted px-1">{access.clientEmail}</code>
            </>
          ) : (
            " HQ's service account"
          )}{" "}
          as a Restricted user in Search Console.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className={summary.ok ? "text-sm text-muted-foreground" : "text-sm text-amber-700 dark:text-amber-400"}>{summary.text}</p>
        {properties.length ? (
          <ul className="flex flex-col gap-3">
            {properties.map((property) => {
              const status = PROPERTY_STATUS[property.status];
              return (
                <li key={property.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <code className="text-sm">{property.site_url}</code>
                      <Badge variant={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{status.hint}</p>
                  </div>
                  <RemoveSearchPropertyForm organizationId={organizationId} propertyId={property.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <MapSearchPropertyForm organizationId={organizationId} suggestion={suggestion} />
        )}
      </CardContent>
    </Card>
  );
}
