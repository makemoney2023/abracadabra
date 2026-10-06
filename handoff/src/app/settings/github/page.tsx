import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clock } from "@/lib/clock";
import { requireHqSuperAdminPage } from "@/lib/current";
import { listVisibleRepos } from "@/lib/github/app";
import { rememberInstallations } from "@/lib/github/installs";
import { readGithubSecrets } from "@/lib/github/secrets";
import { StaffShell } from "../../staff-shell";

export default async function GithubSettingsPage() {
  const { sql } = await requireHqSuperAdminPage();
  const secrets = readGithubSecrets();
  if (!secrets) {
    return (
      <StaffShell>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
          <h1 className="font-heading text-4xl leading-tight">GitHub</h1>
          <Card>
            <CardHeader>
              <CardTitle>Not connected</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                Add the app id, the private key, and the webhook secret on the worker. Then install the app on our
                GitHub org.
              </p>
            </CardContent>
          </Card>
        </main>
      </StaffShell>
    );
  }

  const now = clock();
  const listed = await listVisibleRepos({ secrets, fetch, now });
  if (!listed.ok) {
    return (
      <StaffShell>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
          <h1 className="font-heading text-4xl leading-tight">GitHub</h1>
          <Card>
            <CardHeader>
              <CardTitle>GitHub</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">GitHub did not answer. Try again.</p>
            </CardContent>
          </Card>
        </main>
      </StaffShell>
    );
  }

  await rememberInstallations(sql, listed.value, now);

  return (
    <StaffShell>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-4xl leading-tight">GitHub</h1>
          <p className="text-sm text-muted-foreground">Repos this app can see. Link one from a client page.</p>
        </div>
        {listed.value.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No org yet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">No GitHub org is connected yet. Install the app on our org, then open this page again.</p>
            </CardContent>
          </Card>
        ) : (
          listed.value.map((install) => (
            <Card key={install.id}>
              <CardHeader>
                <CardTitle>{install.accountLogin}</CardTitle>
                <CardDescription>{install.suspended ? "Paused" : "Live"}</CardDescription>
              </CardHeader>
              <CardContent>
                {install.repos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No repos on this install.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {install.repos.map((repo) => (
                      <li key={repo.id} className="font-mono text-sm">
                        {repo.fullName}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </StaffShell>
  );
}
