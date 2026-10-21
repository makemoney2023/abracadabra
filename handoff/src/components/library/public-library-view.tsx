export function PublicLibraryView({
  token,
  result,
}: {
  token: string;
  result:
    | { ok: true; view: { title: string; downloads: boolean; items: { publicId: string; title: string; externalUrl: string | null }[] } }
    | { ok: false; error: "unavailable" | "locked" };
}) {
  if (!result.ok && result.error === "locked") {
    return (
      <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-6 px-6 py-16">
        <h1 className="font-heading text-4xl">This link is locked</h1>
        <form className="flex flex-col gap-3" method="post" action={`/view/${encodeURIComponent(token)}/unlock`}>
          <label className="flex flex-col gap-1 text-sm">
            Passcode
            <input name="passcode" type="password" autoComplete="off" required className="min-h-11 rounded-md border border-border px-3" />
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm">
            Unlock
          </button>
        </form>
      </main>
    );
  }
  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col gap-4 px-6 py-16">
        <h1 className="font-heading text-4xl">This link is not available</h1>
        <p className="text-sm">Ask the studio for a new link.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="font-heading text-4xl">{result.view.title}</h1>
      <ul className="flex flex-col gap-4">
        {result.view.items.map((item) => (
          <li key={item.publicId} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
            <p className="font-medium">{item.title}</p>
            {item.externalUrl ? (
              <a className="break-all text-sm underline" href={item.externalUrl} target="_blank" rel="noreferrer noopener">
                Open
              </a>
            ) : null}
            {result.view.downloads ? (
              <a className="inline-flex min-h-11 items-center text-sm underline" href={`/view/${encodeURIComponent(token)}/files/${encodeURIComponent(item.publicId)}`}>
                Download
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
