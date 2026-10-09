export default function HowHandoffHandlesFiles() {
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-4 px-6 py-[4rem]">
      <h1 className="font-heading text-4xl leading-tight">How Handoff handles files</h1>
      <p>
        First we check that each file is what it says it is. Then a virus scanner looks at it. A
        file ends up clean, refused, or held. Held means a person on our team takes a closer look.
      </p>
      <p>
        Only the people you invite, the staff who work with you, and our admins can see your files.
        People in other workspaces can&apos;t.
      </p>
      <p>
        When a project is done, we put it in the archive. After 90 days, we delete it for good, unless your team picks a different time.
      </p>
    </main>
  );
}
