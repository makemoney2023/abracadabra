import type { ReactNode } from "react";

const STATUS_LABEL: Record<string, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Pending",
};

export function CollectionReviewHeader({
  title,
  status,
  version,
  deliveredAt,
  reviewed,
  total,
  approved,
  changes,
  pending,
}: {
  title: string;
  status: string;
  version: number;
  deliveredAt: number | null;
  reviewed: number;
  total: number;
  approved: number;
  changes: number;
  pending: number;
}) {
  const delivered = deliveredAt ? new Date(deliveredAt).toLocaleDateString("en-CA") : null;
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-heading text-4xl leading-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{status}</p>
      <p className="text-sm">Version {version}{delivered ? ` · Delivered ${delivered}` : ""}</p>
      <p className="text-sm">{reviewed} of {total} reviewed · {approved} approved · {changes} changes requested · {pending} pending</p>
    </header>
  );
}

export function CollectionItemState({ status }: { status: string }) {
  return <p className="text-sm">{STATUS_LABEL[status] ?? status}</p>;
}

export function CollectionReviewFooter({
  pending,
  changes,
  children,
}: {
  pending: number;
  changes: number;
  children: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 border-t border-border bg-background py-3">
      <p className="text-sm">{pending} still to review</p>
      {children}
      {changes > 0 ? <p className="text-sm" role="status">Some pieces already have a change request.</p> : null}
    </div>
  );
}
