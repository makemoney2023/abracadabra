import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function CallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";
  const next = params.next ?? "";

  return (
    <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col justify-center gap-8 px-6 py-[4rem]">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Sign in to Handoff</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>This link is ready</CardTitle>
          <CardDescription>The email link itself does not sign you in. Press the button.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action="/auth/callback/open">
            <input type="hidden" name="token" value={token} />
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <Button type="submit">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
