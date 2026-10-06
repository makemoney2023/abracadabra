import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";

export default async function WorkspaceHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">{workspace.display_name}</h1>
      <p className="text-muted-foreground">
        Nothing is waiting in {workspace.display_name} yet. Operators add requests when they know
        what to collect.
      </p>
    </main>
  );
}
