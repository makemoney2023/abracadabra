import { redirect } from "next/navigation";
import { SignInForm } from "../sign-in-form";
import { PageFrame } from "@/components/page-frame";
import { openSession } from "@/lib/current";
import { isLiveSuperAdmin } from "@/lib/store/staff";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const notice = (await searchParams).notice;
  const session = await openSession();
  if (await isLiveSuperAdmin(session.sql, session.caller)) redirect("/");

  const wrong = notice === "wrong";
  const unconfigured = notice === "unconfigured";
  const linkExpired = notice === "link";
  const openFailed = notice === "open";
  const shareFailed = notice === "share";

  return (
    <PageFrame title="Sign in" description="Use your username and password." width="narrow">
      <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
      {wrong ? (
        <p className="text-sm text-muted-foreground" role="status">
          That username or password is wrong.
        </p>
      ) : null}
      {unconfigured ? (
        <p className="text-sm text-muted-foreground" role="status">
          Sign-in is not set up yet.
        </p>
      ) : null}
      {linkExpired ? (
        <p className="text-sm text-muted-foreground" role="status">
          That link has run out. Ask for a new one.
        </p>
      ) : null}
      {openFailed ? (
        <p className="text-sm text-muted-foreground" role="status">
          We could not sign you in. Please try again soon.
        </p>
      ) : null}
      {shareFailed ? (
        <p className="text-sm text-muted-foreground" role="status">
          That share link does not work.
        </p>
      ) : null}
      <SignInForm />
    </PageFrame>
  );
}
