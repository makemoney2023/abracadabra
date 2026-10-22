import { describe, expect, it } from "vitest";
import type { SocialPost } from "@/lib/social";
import { calendarPosts } from "./calendar-posts";

const post: SocialPost = {
  id: "p1",
  organization_id: "org-1",
  deliverable_id: "d-1",
  item_id: "item-1",
  version: 1,
  account_ids: "[]",
  mode: "scheduled",
  post_type: "feed",
  skipped: null,
  scheduled_for: 1_800_000_000_000,
  timezone: "UTC",
  status: "scheduled",
  zernio_post_id: null,
  error: null,
  published_urls: null,
  created_at: 1,
  updated_at: 1,
};

describe("calendar pictures", () => {
  it("uses the poster still when the piece has one", () => {
    const [card] = calendarPosts([post], [], [{
      id: "item-1",
      status: "approved",
      media: [
        { role: "main", contentType: "image/png" },
        { role: "poster", contentType: "image/jpeg" },
      ],
    }]);
    expect(card?.thumbnailRole).toBe("poster");
  });

  it("leaves the chip without a role when the piece is video only", () => {
    const [card] = calendarPosts([post], [], [{
      id: "item-1",
      status: "approved",
      media: [{ role: "main", video: true, contentType: "video/mp4" }],
    }]);
    expect(card?.thumbnailRole).toBe("");
  });
});
