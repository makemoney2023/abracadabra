import Link from "next/link";
import { notFound } from "next/navigation";
import { listWorkspaceDeliverables } from "@/db/deliverables";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DELIVERABLE_KIND_LABEL, DELIVERABLE_STATUS_LABEL } from "../../../deliverables/labels";

export default async function FinishedWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const cards = await listWorkspaceDeliverables(sql, caller, workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">Finished work</h1>
      {cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to look at yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map((card) => (
            <li key={card.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{card.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">{DELIVERABLE_KIND_LABEL[card.kind]}</Badge>
                  <span className="text-sm text-muted-foreground">{DELIVERABLE_STATUS_LABEL[card.status]}</span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/w/${slug}/work/${card.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
