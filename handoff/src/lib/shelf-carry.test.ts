import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { captionForImage, restorePublishedShelves } from "./shelf-carry";

const NOW = 1_800_000_000_000;

const NOTES = `
## Schema 1: Can AI read your site?

**Image:** \`schema-1.png\`

**Caption:**
Your next customer might ask ChatGPT who to call. Can it read your website?

Schema reads the site and shows what an assistant can see.

## Readiness Check 1: Where your week goes

**Image:** \`check-1.png\`

**Caption:**
The check shows where the week goes, before you hire another person.
`;

describe("caption for an image", () => {
  it("reads the caption under the image name and leaves other sections alone", () => {
    expect(captionForImage(NOTES, "schema-1.png")).toBe(
      "Your next customer might ask ChatGPT who to call. Can it read your website?\n\nSchema reads the site and shows what an assistant can see.",
    );
    expect(captionForImage(NOTES, "check-1.png")).toBe(
      "The check shows where the week goes, before you hire another person.",
    );
    expect(captionForImage(NOTES, "linkedin-banner.png")).toBeNull();
  });
});

describe("a one-piece revision", () => {
  it("keeps the earlier posts on the published set and puts their captions on the pictures", async () => {
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
         request_digest, status, opened_at, organization_id
       ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, published_version, published_at, actor_kind, created_at, updated_at
       ) VALUES ('d-1', 'org-1', 'ws-1', 'Social', 'document', 'approved', 2, 2, ?, 'agent', ?, ?)`,
      [NOW, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, title, copy_text, media_json, status, sort
       ) VALUES ('page-1', 'd-1', 1, 'page', 'Social set', ?, '[]', 'pending', 0),
                ('schema-1', 'd-1', 1, 'static', 'schema-1.png', NULL, '[]', 'pending', 1),
                ('check-1', 'd-1', 1, 'static', 'check-1.png', NULL, '[]', 'pending', 2),
                ('banner-old', 'd-1', 1, 'static', 'linkedin-banner.png', NULL, '[]', 'changes_requested', 3),
                ('banner-new', 'd-1', 2, 'static', 'linkedin-banner.png', NULL, '[]', 'approved', 0)`,
      [NOTES],
    );

    const copied = await restorePublishedShelves(sql);
    expect(copied).toBeGreaterThan(0);
    const shelf = await sql.all<{ title: string; copy_text: string | null; version: number }>(
      "SELECT title, copy_text, version FROM deliverable_items WHERE deliverable_id = 'd-1' AND version = 2",
    );
    expect(shelf.map((item) => item.title).toSorted()).toEqual(["Social set", "check-1.png", "linkedin-banner.png", "schema-1.png"]);
    expect(shelf.find((item) => item.title === "schema-1.png")?.copy_text).toContain("Can it read your website?");
    expect(shelf.find((item) => item.title === "check-1.png")?.copy_text).toContain("where the week goes");
    expect(shelf.find((item) => item.title === "linkedin-banner.png")?.copy_text).toBeNull();
    expect(await restorePublishedShelves(sql)).toBe(0);
  });
});
