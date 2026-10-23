import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PostPreviewData } from "./post-preview-model";
import { fallbackPreview, SocialPostPreview } from "./social-post-preview";

vi.mock("@/components/ui/dialog", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Dialog: Box, DialogContent: Box, DialogHeader: Box, DialogTitle: Box, DialogDescription: Box };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div data-testid="confirm">{children}</div> : null),
    AlertDialogCancel: Box,
    AlertDialogContent: Box,
    AlertDialogDescription: Box,
    AlertDialogFooter: Box,
    AlertDialogHeader: Box,
    AlertDialogTitle: Box,
  };
});
vi.mock("@/app/clients/social-actions", () => ({ moveSocialPostAction: vi.fn(), cancelSocialPostAction: vi.fn() }));
vi.mock("@/app/clients/social-forms", () => ({ RetrySocialPostForm: () => <span>Retry form</span> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const NOW = Date.parse("2026-11-02T12:00:00Z");

function data(extra: Partial<PostPreviewData> = {}): PostPreviewData {
  return {
    postId: "p-1",
    itemId: "i-1",
    deliverableId: "d-1",
    deliverableTitle: "November social",
    title: "Window light",
    status: "scheduled",
    postType: "image",
    format: "static",
    scheduledFor: Date.parse("2026-11-03T15:00:00Z"),
    timezone: "America/Toronto",
    accounts: [{ id: "a-1", platform: "linkedin", name: "Acme", label: "LinkedIn · Acme" }],
    caption: "Plain words about window light.",
    captions: {},
    media: [{ role: "main", video: false, contentType: "image/png" }],
    pieceStatus: "approved",
    hasScheduledCopy: true,
    error: null,
    skipped: null,
    publishedLinks: [],
    ...extra,
  };
}

function render(post: PostPreviewData, extra: { canAct?: boolean; intent?: "view" | "reschedule" | "remove" } = {}) {
  return renderToStaticMarkup(
    <SocialPostPreview
      data={post}
      others={[]}
      intent={extra.intent ?? "view"}
      canAct={extra.canAct ?? true}
      organizationId="org-1"
      librarySlug="acme"
      now={NOW}
      onClose={() => undefined}
      onDone={() => undefined}
    />,
  );
}

describe("calendar post preview", () => {
  it("shows the post as it will appear, with its time, zone, status and links", () => {
    const html = render(data());
    expect(html).toContain("Window light");
    expect(html).toContain("LinkedIn · Acme");
    expect(html).toContain("Plain words about window light.");
    expect(html).toContain("Window light: loading preview");
    expect(html).toContain("Tue, Nov 3, 2026, 10:00 AM (America/Toronto)");
    expect(html).toContain("Scheduled");
    expect(html).toContain('href="/w/acme/work/d-1?item=i-1"');
    expect(html).toContain('href="/deliverables/d-1"');
    expect(html).not.toContain(">Schedule<");
  });

  it("offers Reschedule and Remove to staff on a scheduled post", () => {
    const html = render(data());
    expect(html).toContain("Reschedule");
    expect(html).toContain("Remove");
    expect(html).not.toContain('data-testid="confirm"');
  });

  it("opens the time picker or the remove confirmation straight from a chip button", () => {
    const resched = render(data(), { intent: "reschedule" });
    expect(resched).toContain('type="datetime-local"');
    expect(resched).toContain('value="2026-11-03T10:00"');
    expect(resched).toContain("Time zone: America/Toronto");
    const remove = render(data(), { intent: "remove" });
    expect(remove).toContain('data-testid="confirm"');
    expect(remove).toContain("Remove this post?");
    expect(remove).toContain("will not go out");
    expect(remove).toContain("Keep it");
  });

  it("shows a published post read-only with its public link and the reason", () => {
    const html = render(data({ status: "published", publishedLinks: [{ platform: "linkedin", url: "https://www.linkedin.com/feed/update/1" }] }));
    expect(html).toContain("View on LinkedIn");
    expect(html).toContain("already live");
    expect(html).not.toContain(">Reschedule<");
    expect(html).not.toContain(">Remove<");
  });

  it("closes both actions on a sending post and says why", () => {
    const html = render(data({ status: "sending" }));
    expect(html).toContain("going out now");
    expect(html).not.toContain("Reschedule");
  });

  it("shows a failed post's error and a retry, not move or remove", () => {
    const html = render(data({ status: "failed", error: "LinkedIn: the image was too large" }));
    expect(html).toContain("LinkedIn: the image was too large");
    expect(html).toContain("Retry form");
    expect(html).not.toContain(">Reschedule<");
  });

  it("leaves a client with a read-only preview and no actions or staff links", () => {
    const html = render(data({ status: "failed" }), { canAct: false });
    expect(html).toContain("This post did not go out");
    expect(html).not.toContain("Reschedule");
    expect(html).not.toContain("/deliverables/d-1");
    expect(html).not.toContain("Retry form");
    const ok = render(data(), { canAct: false });
    expect(ok).not.toContain("Reschedule");
    expect(ok).not.toContain("Remove");
  });

  it("opens a post the loader could not read with what the calendar knows", () => {
    const html = render(fallbackPreview({ id: "p-9", title: "Quiet post", state: "scheduled", at: NOW + 3_600_000, timezone: "UTC", accountLabel: "LinkedIn · Acme", deliverableId: "d-9", itemId: "i-9", collection: "Round 2" }));
    expect(html).toContain("Quiet post");
    expect(html).toContain("not available here");
  });
});

describe("calendar post preview labels", () => {
  it("says when a failed post was set for, not when it goes out", () => {
    const html = render(data({ status: "failed" }));
    expect(html).toContain("Was set for");
    expect(html).not.toContain("Goes out");
  });
});
