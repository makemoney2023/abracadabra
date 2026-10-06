import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/current";
import { listHeldFiles } from "@/lib/review";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeldReview } from "./held-review";

export default async function HeldPage() {
  const { sql, caller } = await requireSuperAdminPage();
  const files = await listHeldFiles(sql, caller);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Held files</h1>
        <Link href="/spaces" className="text-sm">
          Staff tools
        </Link>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No held files.</p>
      ) : (
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
      )}
    </main>
  );
}
