import { SignInForm } from "./sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function HqHome({
  signedIn,
  linkExpired,
  openFailed,
  shareFailed,
}: {
  signedIn: boolean;
  linkExpired: boolean;
  openFailed: boolean;
  shareFailed: boolean;
}) {
  if (signedIn) {
    return (
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="font-heading text-4xl leading-tight">Studio</h1>
        <p className="text-muted-foreground">This page is for staff.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Studio</h1>
        <p className="text-muted-foreground">Sign in to see clients and file spaces.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your username and password.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkExpired ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That link has run out. Ask for a new one.
            </p>
          ) : null}
          {openFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              We could not sign you in. Please try again soon.
            </p>
          ) : null}
          {shareFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That share link does not work.
            </p>
          ) : null}
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
