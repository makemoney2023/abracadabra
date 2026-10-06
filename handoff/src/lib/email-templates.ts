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
        subject: `New files are ready from ${name}`,
        body: [name, "", `${title} is done. We checked ${count} file${count === 1 ? "" : "s"}, and ${count === 1 ? "it is" : "they are"} safe to open.`],
      };
    case "file.rejected":
    case "file.rejected_from_held":
      return {
        subject: `A file from ${name} was turned away`,
        body: [name, "", `We turned away a file in ${title}. Our scan found: ${finding}. That makes ${count} file${count === 1 ? "" : "s"} turned away so far.`],
      };
    case "file.held":
      return {
        subject: `A file from ${name} needs a look`,
        body: [name, "", `We set aside a file in ${title} so a person can check it. Our scan found: ${finding}.`],
      };
    case "file.released":
      return {
        subject: `A file from ${name} is OK`,
        body: [name, "", `A person checked the file in ${title}. It is safe, so we let it through.`],
      };
    case "batch.window_failed":
      return {
        subject: `Some files from ${name} did not finish`,
        body: [name, "", `${title} closed, but ${count} file${count === 1 ? "" : "s"} did not finish uploading.`],
      };
    case "request.digest":
      return {
        subject: `${name} is still waiting on files`,
        body: [name, "", `${count} request${count === 1 ? " is" : "s are"} still waiting for files.`],
      };
    case "workspace.archived":
      return {
        subject: `${name} is now archived`,
        body: [
          name,
          "",
          purgeOn
            ? `This space is archived. You can still download files until ${purgeOn}. After that, we delete them.`
            : "This space is archived. You can still download files until we delete them.",
        ],
      };
    case "workspace.purge_scheduled":
      return {
        subject: `${name} will be deleted soon`,
        body: [
          name,
          "",
          purgeOn
            ? `We will delete everything on ${purgeOn}. Please download what you still need.`
            : "We will delete everything soon. Please download what you still need.",
        ],
      };
    default:
      return {
        subject: `News from ${name}`,
        body: [name, "", title],
      };
  }
}
