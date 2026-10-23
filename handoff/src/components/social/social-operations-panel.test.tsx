import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SocialReviewPiece } from "@/lib/social-review";
import { SocialOperationsPanel } from "./social-operations-panel";

vi.mock("@/app/clients/social-actions", () => ({ moveSocialPostAction: vi.fn(), placeSocialPieceAction: vi.fn() }));
vi.mock("@/app/w/[slug]/work/forms", () => ({ ApproveForm: () => null, ChangesForm: () => null }));
vi.mock("@/app/clients/social-forms", () => ({ CancelSocialPostForm: () => null, MoveSocialPostForm: () => null, RetrySocialPostForm: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

function piece(id: string, status: SocialReviewPiece["status"]): SocialReviewPiece {
  return {
    id,
    title: `Piece ${id}`,
    caption: "",
    status,
    format: "static",
    deliverableId: "d-1",
    deliverableTitle: "October social",
    version: 1,
    slug: "acme",
    accountName: "Acme",
    media: [],
    platforms: [],
  };
}

describe("social operations side rail", () => {
  it("opens each waiting and approved entry on its approval screen", () => {
    const html = renderToStaticMarkup(
      <SocialOperationsPanel
        attention={[]}
        posts={[]}
        timeZone="UTC"
        now={0}
        waiting={[piece("a", "pending")]}
        ready={[piece("b", "approved")]}
        approveLabel="Approve"
        organizationId="org-1"
        canReschedule={false}
      />,
    );
    expect(html).toContain('href="/w/acme/work/d-1?item=a"');
    expect(html).toContain('href="/w/acme/work/d-1?item=b"');
  });
});
