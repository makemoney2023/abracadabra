export default function HowHandoffHandlesFiles() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-16">
      <h1 className="font-heading text-4xl leading-tight">How Handoff handles files</h1>
      <p>
        Handoff checks a file&apos;s signature, then a ClamAV scan marks it clean, rejected, or held.
      </p>
      <p>
        Invited members, assigned operators, and super-admins can see files in that workspace. People
        in other workspaces cannot.
      </p>
      <p>
        An archived workspace is purged after its retention period. The default retention is 90 days.
      </p>
    </main>
  );
}
