import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { articleSocialPromoEnabled } from "./article-promotions";
import { libraryViewLinksEnabled } from "./library-shares";
import { libraryMetric, metricOmitsSecrets, recordLibraryMetric } from "./library-metrics";
import { workerEnv } from "./worker-env";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

describe("library flags and metrics", () => {
  it("keeps both flags off until they are explicitly on", () => {
    expect(libraryViewLinksEnabled(undefined)).toBe(false);
    expect(libraryViewLinksEnabled("off")).toBe(false);
    expect(articleSocialPromoEnabled("")).toBe(false);
    expect(articleSocialPromoEnabled("on")).toBe(true);
    delete process.env.LIBRARY_VIEW_LINKS;
    delete process.env.ARTICLE_SOCIAL_PROMO;
    delete process.env.HANDOFF_SHARE_HASH_PEPPER;
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = {
      env: { LIBRARY_VIEW_LINKS: "on", ARTICLE_SOCIAL_PROMO: "on", HANDOFF_SHARE_HASH_PEPPER: "bound-pepper" },
    };
    expect(libraryViewLinksEnabled()).toBe(true);
    expect(articleSocialPromoEnabled()).toBe(true);
    expect(workerEnv("HANDOFF_SHARE_HASH_PEPPER")).toBe("bound-pepper");
    process.env.LIBRARY_VIEW_LINKS = "off";
    expect(libraryViewLinksEnabled()).toBe(false);
    delete process.env.LIBRARY_VIEW_LINKS;
    delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  });

  it("records a count without a token, passcode, or URL", async () => {
    const metric = libraryMetric({ name: "view_link_created", workspaceId: "ws-1", count: 1 });
    expect(metricOmitsSecrets(metric)).toBe(true);
    expect(JSON.stringify(metric)).not.toMatch(/token|passcode|https:/i);
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    const now = 1_800_000_000_000;
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [now, now]);
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
       ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
      [now],
    );
    await recordLibraryMetric(sql, { name: "article_promotion_created", organizationId: "org-1", workspaceId: "ws-1", artifactType: "article" }, now);
    const row = await sql.get<{ data_json: string }>("SELECT data_json FROM activities");
    expect(row?.data_json).toContain("article_promotion_created");
    expect(row?.data_json).not.toContain("http");
  });
});
