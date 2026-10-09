import { requireSuperAdminPage } from "@/lib/current";
import { listHeldFiles } from "@/lib/review";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { HeldReview } from "./held-review";

export default async function HeldPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const files = await listHeldFiles(sql, caller);
  if (files.length === 0) {
    return <EmptyState title="No held files." body="A file shows up here when a scan needs a person." />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {files.map((file) => (
        <li key={file.id}>
          <Card>
            <CardHeader>
              <CardTitle>{file.relativePath}</CardTitle>
              <CardDescription>
                {file.workspaceName} needs a written reason before this file can leave review.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <HeldReview file={file} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
