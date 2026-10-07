import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ShareConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const action = `/share/${encodeURIComponent(token)}/open`;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Open this folder</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>This link is ready</CardTitle>
          <CardDescription>The email link itself does not open the folder. Press the button.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action={action}>
            <Button type="submit">Open the folder</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
