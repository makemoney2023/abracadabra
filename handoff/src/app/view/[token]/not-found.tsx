export default function ViewLinkNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="eyebrow text-optic">Finished work</p>
        <h1 className="mt-2 font-heading text-3xl leading-tight">This link is not available.</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ask the person who shared it with you for a current link.
        </p>
      </section>
    </main>
  );
}
