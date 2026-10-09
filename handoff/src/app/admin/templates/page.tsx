import { requireStaffPage } from "@/lib/current";
import { templateCatalog } from "@/lib/store/requests";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { AddItemForm, CreateTemplateForm, MoveItemForm, RetireItemForm, RetireTemplateForm } from "./template-forms";

export default async function TemplatesPage() {
  const { sql } = await requireStaffPage();
  const templates = await templateCatalog(sql);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>New template</CardTitle>
          <CardDescription>
            A space copies these items when it is opened. Later edits stay on the template.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateTemplateForm />
        </CardContent>
      </Card>
      {templates.length === 0 ? (
        <EmptyState title="No live templates yet." body="Add a template when the same file ask should open with a space." />
      ) : (
        templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <CardTitle>{template.name}</CardTitle>
              <CardDescription>
                {template.items.length === 0 ? "No items yet." : "These items are copied into each new space."}
              </CardDescription>
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
    </div>
  );
}
