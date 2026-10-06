import { AccessForm } from "./access-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">A locker for one client.</h1>
        <p className="text-muted-foreground">
          Invited people drop brand, photo, copy, and reference files. Operators verify them
          after a malware scan. Handoff is not part of any client&apos;s product.
        </p>
      </div>
      <Card id="access">
        <CardHeader>
          <CardTitle>Open an invite</CardTitle>
          <CardDescription>
            Sign-in is the email on an invite. This check does not create an account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccessForm />
        </CardContent>
      </Card>
    </main>
  );
}
