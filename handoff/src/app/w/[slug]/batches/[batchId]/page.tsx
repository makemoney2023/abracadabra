import Link from "next/link";
import { notFound } from "next/navigation";
import { workspacesFor } from "@/db/records";
import { loadBatchScreen } from "@/lib/downloads";
import { openSession } from "@/lib/current";
import { BatchReview } from "./batch-review";

export default async function BatchPage({
  params,
}: {
  params: Promise<{ slug: string; batchId: string }>;
}) {
  const { slug, batchId } = await params;
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === slug);
  if (!workspace) notFound();
  const screen = await loadBatchScreen(sql, caller, batchId);
  if (!screen) notFound();
  const clean = screen.files.some((file) => file.status === "clean");
  const discardNote = screen.discarded
    ? "This upload was thrown away."
    : clean
      ? "This upload has a safe file in it, so you can't throw it away."
      : "";
  return (
    <main className="mx-auto flex w-full max-w-[48rem] flex-1 flex-col gap-6 px-6 py-[4rem]">
      <Link href={`/w/${workspace.slug}`} className="text-sm">
        Back to files
      </Link>
      <h1 className="font-heading text-4xl leading-tight">{screen.label ?? "Files"}</h1>
      <BatchReview
        batchId={batchId}
        files={screen.files}
        canTag={screen.canTag}
        canDiscard={screen.canDiscard && !screen.discarded && !clean}
        canExport={screen.canExport}
        discardNote={discardNote}
      />
    </main>
  );
}
