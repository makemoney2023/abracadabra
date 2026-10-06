import type { OutboundMail } from "@/lib/session";

export type ProductMailPayload = {
  displayName: string;
  slug: string;
  batchId?: string;
  title?: string | null;
  label?: string | null;
  finding?: string | null;
  count?: number;
  purgeOn?: string;
};

/** One Handoff page. The body must not add a second URL, a signed URL, or file bytes. */
export function productPageLink(origin: string, event: string, payload: ProductMailPayload): string {
  const base = origin.replace(/\/$/, "");
  const batchLink = event.startsWith("batch.") || event.startsWith("file.");
  if (batchLink && payload.batchId) {
    return `${base}/w/${payload.slug}/batches/${payload.batchId}`;
  }
  return `${base}/w/${payload.slug}`;
}

/** Product email copy. The finding is a scanner name, and the path is omitted. */
export function renderProductEmail(input: {
  from: string;
  to: string;
  event: string;
  payload: ProductMailPayload;
  origin: string;
}): OutboundMail {
  const link = productPageLink(input.origin, input.event, input.payload);
  const name = input.payload.displayName;
  const title = input.payload.title || input.payload.label || "this handoff";
  const finding = input.payload.finding ?? "unspecified";
  const count = input.payload.count ?? 0;
  const lines = copy(input.event, name, title, finding, count, input.payload.purgeOn ?? null);
  return {
    from: input.from,
    to: input.to,
    subject: lines.subject,
    text: [...lines.body, "", link].join("\n"),
  };
}

function copy(
  event: string,
  name: string,
  title: string,
  finding: string,
  count: number,
  purgeOn: string | null,
): { subject: string; body: string[] } {
  switch (event) {
    case "batch.ready":
      return {
        subject: `${name} has files ready`,
        body: [name, "", `${title} finished scanning with ${count} clean file${count === 1 ? "" : "s"}.`],
      };
    case "file.rejected":
    case "file.rejected_from_held":
      return {
        subject: `${name} refused a file`,
        body: [name, "", `${title} was refused. Scanner finding: ${finding}. ${count} file${count === 1 ? "" : "s"} counted.`],
      };
    case "file.held":
      return {
        subject: `${name} held a file`,
        body: [name, "", `${title} is held for review. Scanner finding: ${finding}.`],
      };
    case "file.released":
      return {
        subject: `${name} released a file`,
        body: [name, "", `${title} was released and is clean.`],
      };
    case "batch.window_failed":
      return {
        subject: `${name} closed a batch with failed files`,
        body: [name, "", `${title} closed with ${count} failed file${count === 1 ? "" : "s"}.`],
      };
    case "request.digest":
      return {
        subject: `${name} still has open requests`,
        body: [name, "", `${count} request${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} still open.`],
      };
    case "workspace.archived":
      return {
        subject: `${name} was archived`,
        body: [
          name,
          "",
          purgeOn
            ? `This workspace is archived. Downloads stay available until purge on ${purgeOn}.`
            : "This workspace is archived. Downloads stay available until purge.",
        ],
      };
    case "workspace.purge_scheduled":
      return {
        subject: `${name} will be purged`,
        body: [
          name,
          "",
          purgeOn
            ? `Purge is scheduled for ${purgeOn}. Download anything you still need.`
            : "Purge is scheduled. Download anything you still need.",
        ],
      };
    default:
      return {
        subject: `${name} Handoff update`,
        body: [name, "", title],
      };
  }
}
