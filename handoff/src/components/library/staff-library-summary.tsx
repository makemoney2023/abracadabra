import Link from "next/link";

export type StaffLibrarySummaryModel = {
  workspaceId: string;
  slug: string;
  name: string;
  counts: Record<string, number>;
  reviewNeeded: number;
  recent: { title: string; status: string }[];
  viewLinks: { live: number; revoked: number };
};

export function StaffLibrarySummary({ summary }: { summary: StaffLibrarySummaryModel }) {
  const entries = Object.entries(summary.counts).filter(([key]) => key !== "total");
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <h3 className="font-medium">{summary.name}</h3>
      <p className="text-sm">Held work stays on the studio side until it is released.</p>
      <p className="text-sm">{summary.reviewNeeded} need review</p>
      <ul className="flex flex-wrap gap-2 text-sm">
        {entries.map(([type, count]) => (
          <li key={type}>{type}: {count}</li>
        ))}
      </ul>
      {summary.recent.length > 0 ? (
        <ul className="text-sm">
          {summary.recent.map((item) => (
            <li key={item.title}>{item.title} · {item.status}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No finished work yet.</p>
      )}
      <p className="text-sm">{summary.viewLinks.live} view links · {summary.viewLinks.revoked} revoked</p>
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center underline" href={`/w/${summary.slug}/library`}>Library</Link>
        <Link className="inline-flex min-h-11 items-center underline" href={`/w/${summary.slug}`}>Sources</Link>
      </div>
    </section>
  );
}
