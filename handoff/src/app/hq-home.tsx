import { SignInForm } from "./sign-in-form";
import { signOut } from "./sign-out-action";
import { EmptyState } from "@/components/empty-state";
import { ExternalLink } from "@/components/external-link";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { DEFAULT_CLIENT_ORIGIN } from "@/lib/host";

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
      <PageFrame title="Studio" width="narrow">
        <EmptyState
          title="This account is not on the HQ staff list"
          body="Sign out, or open the client portal."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
              <ExternalLink href={DEFAULT_CLIENT_ORIGIN}>Client portal</ExternalLink>
            </div>
          }
        />
      </PageFrame>
    );
  }
  return (
    <PageFrame title="Sign in" description="Sign in to see clients and file spaces." width="narrow">
      <p className="font-mono text-xs tracking-wide text-optic">Handoff</p>
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
