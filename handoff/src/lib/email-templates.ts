import type { OutboundMail } from "@/lib/session";
import { STUDIO } from "@/lib/brand/studio";
import { LIMITS } from "@/lib/policy/limits";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Style attributes need single quotes. STUDIO stacks use double quotes. */
function emailFont(stack: string): string {
  return stack.replaceAll('"', "'");
}

/** Solid stand-in for the studio hairline. Email clients drop color-mix. */
const HAIRLINE = "#2A2926";

/** Invite mail. One link, a plain copy, and an HTML card in the Abracadabra studio colors. */
export function renderInviteEmail(input: {
  from: string;
  to: string;
  spaceName: string;
  url: string;
}): OutboundMail {
  const space = input.spaceName.trim() || "Handoff";
  const minutes = Math.round(LIMITS.magicLinkTtlMs / 60_000);
  const safeSpace = escapeHtml(space);
  const safeUrl = escapeHtml(input.url);
  const text = [
    `You're invited to ${space}`,
    "",
    `${space} has a private folder ready for you.`,
    "",
    "Use this link to open Handoff. Then press the button on the page:",
    input.url,
    "",
    `The link stops working in ${minutes} minutes. If you did not ask for it, just ignore this email.`,
  ].join("\n");
  const display = emailFont(STUDIO.display);
  const body = emailFont(STUDIO.body);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>You're invited</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=Tektur:wght@500;600&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:${STUDIO.canvas};background-color:${STUDIO.canvas};">
<div style="display:none;max-height:0;overflow:hidden;color:${STUDIO.canvas};">${safeSpace} has a private folder ready for you.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${STUDIO.canvas}" style="background:${STUDIO.canvas};background-color:${STUDIO.canvas};">
<tr><td align="center" style="padding:48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;margin:0 auto;">
<tr><td style="padding:0 4px 18px;font-family:'IBM Plex Mono','Geist Mono',ui-monospace,monospace;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${STUDIO.accent};">HANDOFF</td></tr>
<tr><td bgcolor="${STUDIO.surface}" style="background:${STUDIO.surface};background-color:${STUDIO.surface};border:1px solid ${HAIRLINE};border-left:2px solid ${STUDIO.accent};border-radius:2px;padding:40px 36px;">
<p style="margin:0 0 14px;font-family:${display};font-size:34px;font-weight:600;line-height:1.05;letter-spacing:-0.03em;color:${STUDIO.ink};">You're invited</p>
<p style="margin:0 0 28px;font-family:${body};font-size:16px;line-height:1.55;color:${STUDIO.inkSoft};">${safeSpace} has a private folder ready for you.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${STUDIO.accent}" style="background:${STUDIO.accent};background-color:${STUDIO.accent};border:1px solid ${STUDIO.accent};border-radius:2px;">
<a href="${safeUrl}" style="display:inline-block;padding:14px 22px;font-family:${body};font-size:14px;font-weight:500;line-height:1;color:${STUDIO.accentInk};text-decoration:none;">Open your invite</a>
</td></tr></table>
<p style="margin:28px 0 0;font-family:${body};font-size:13px;line-height:1.55;color:${STUDIO.inkSoft};">The email link itself does not sign you in. Press the button on the page. This link stops working in ${minutes} minutes.</p>
</td></tr>
<tr><td style="padding:18px 4px 0;font-family:${body};font-size:12px;line-height:1.5;color:${STUDIO.inkSoft};">If you did not ask for this, you can ignore this email.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return {
    from: input.from,
    to: input.to,
    subject: `You're invited to ${space}`,
    text,
    html,
  };
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
