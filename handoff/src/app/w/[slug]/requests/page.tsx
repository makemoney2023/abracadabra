import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { can } from "@/lib/authz";
import { openSession } from "@/lib/current";
import { workspaceRequests } from "@/lib/store/requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CloseRequestForm, CreateRequestForm, EditRequestForm, ReopenRequestForm } from "./request-forms";

function dueInput(dueOn: number | null): string {
  if (dueOn === null) return "";
  return new Date(dueOn).toISOString().slice(0, 10);
}

export default async function RequestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace || !can(caller, "request.manage", { workspaceId: workspace.id })) notFound();
  const requests = await workspaceRequests(sql, workspace.id);
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-8 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">Ask for files</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ask for files</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateRequestForm slug={workspace.slug} />
        </CardContent>
      </Card>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven&apos;t asked for anything in {workspace.display_name} yet.</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{request.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {request.status === "received"
                      ? "Got files"
                      : request.status === "closed"
                        ? "Closed"
                        : "Waiting for files"}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <EditRequestForm
                    slug={workspace.slug}
                    requestId={request.id}
                    title={request.title}
                    guidance={request.guidance ?? ""}
                    suggestedTag={request.suggested_tag ?? ""}
                    dueOn={dueInput(request.due_on)}
                  />
                  {request.status === "closed" ? (
                    <ReopenRequestForm slug={workspace.slug} requestId={request.id} />
                  ) : (
                    <CloseRequestForm slug={workspace.slug} requestId={request.id} />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
