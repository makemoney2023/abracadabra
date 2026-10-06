import { redirect } from "next/navigation";
import { SignInForm } from "../sign-in-form";
import { openSession } from "@/lib/current";
import { isLiveSuperAdmin } from "@/lib/store/staff";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const notice = (await searchParams).notice;
  const session = await openSession();
  if (await isLiveSuperAdmin(session.sql, session.caller)) redirect("/admin");

  const wrong = notice === "wrong";
  const unconfigured = notice === "unconfigured";
  const openFailed = notice === "open";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
        <h1 className="font-heading text-4xl leading-tight">Sign in</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Admin</CardTitle>
          <CardDescription>Use your username and password to open staff tools.</CardDescription>
        </CardHeader>
        <CardContent>
          {wrong ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              That username or password is wrong.
            </p>
          ) : null}
          {unconfigured ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              Sign-in is not set up yet.
            </p>
          ) : null}
          {openFailed ? (
            <p className="mb-3 text-sm text-muted-foreground" role="status">
              We could not sign you in. Please try again soon.
            </p>
          ) : null}
          <SignInForm />
        </CardContent>
      </Card>
    </main>
  );
}
