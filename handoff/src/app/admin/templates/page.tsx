import Link from "next/link";
import { requireStaffPage } from "@/lib/current";
import { templateCatalog } from "@/lib/store/requests";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddItemForm, CreateTemplateForm, MoveItemForm, RetireItemForm, RetireTemplateForm } from "./template-forms";

export default async function TemplatesPage() {
  const { sql, caller } = await requireStaffPage();
  const templates = await templateCatalog(sql);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Request templates</h1>
        <div className="flex gap-4 text-sm">
          <Link href="/">Home</Link>
          {caller.staff?.superAdmin ? <Link href="/admin">Staff tools</Link> : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
          <CardDescription>
            A workspace copies these items when it is opened. Later edits stay on the template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTemplateForm />
        </CardContent>
      </Card>
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No live templates yet.</p>
      ) : (
        templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>{template.items.length === 0 ? "No items yet." : "These items are copied into each new space."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {template.items.length > 0 ? (
                <ol className="flex flex-col gap-4">
                  {template.items.map((item, index) => (
                    <li key={item.id} className="flex flex-col gap-2 border-b border-border pb-4">
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.guidance ? <p className="text-sm text-muted-foreground">{item.guidance}</p> : null}
                      {item.suggested_tag ? (
                        <p className="font-mono text-xs text-muted-foreground">{item.suggested_tag}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {index > 0 ? (
                          <MoveItemForm templateId={template.id} itemId={item.id} direction="up" />
                        ) : null}
                        {index < template.items.length - 1 ? (
                          <MoveItemForm templateId={template.id} itemId={item.id} direction="down" />
                        ) : null}
                        <RetireItemForm templateId={template.id} itemId={item.id} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
              <AddItemForm templateId={template.id} />
              <RetireTemplateForm templateId={template.id} />
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}
