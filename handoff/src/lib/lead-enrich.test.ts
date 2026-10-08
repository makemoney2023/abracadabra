import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { enrichLeadFromSchema, leadFillFromSchema } from "./lead-enrich";

const NOW = 1_700_000_000_000;

describe("schema enrichment", () => {
  it("fills a placeholder lead and leaves a typed name alone", () => {
    const fill = leadFillFromSchema(
      { name: "northwind.example", domain: "northwind.example", website: null, industry: null, notes: null },
      {
        businessName: "Northwind",
        description: "We build yards.",
        emails: ["ada@northwind.example"],
        phones: ["+16175550100"],
        sameAs: ["https://northwind.example/about"],
        address: { streetAddress: "1 Dock St", addressLocality: "Boston" },
        openingHours: ["Mo-Fr 09:00-17:00"],
        existingTypes: ["Organization", "LocalBusiness"],
      },
      [{ name: "Ada North", title: "Owner", email: "ada@northwind.example" }],
      "https://northwind.example/",
    );
    expect(fill.name).toBe("Northwind");
    expect(fill.website).toBe("https://northwind.example/");
    expect(fill.industry).toBe("Local Business");
    expect(fill.notes).toContain("We build yards.");
    expect(fill.notes).toContain("1 Dock St");
    expect(fill.contacts.map((contact) => contact.email)).toEqual(["ada@northwind.example", null]);
    const kept = leadFillFromSchema(
      { name: "Northwind Yards", domain: "northwind.example", website: "https://northwind.example", industry: "Marine", notes: "We build yards." },
      { businessName: "Other", description: "We build yards." },
      [],
      "https://other.example",
    );
    expect(kept.name).toBeUndefined();
    expect(kept.website).toBeUndefined();
    expect(kept.industry).toBeUndefined();
    expect(kept.notes).toBeUndefined();
  });

  it("writes the schema details onto the lead", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    const sql: Sql = sqliteSql(db);
    await migrate(sql);
    await sql.exec(`
      CREATE TABLE readiness_scans (
        id TEXT PRIMARY KEY, domain TEXT, origin TEXT, status TEXT, organization_id TEXT,
        score_total INTEGER, created_at INTEGER, completed_at INTEGER
      );
      CREATE TABLE readiness_scan_pages (
        id TEXT PRIMARY KEY, scan_id TEXT, url TEXT, evidence_json TEXT, schema_types_json TEXT
      );
    `);
    await sql.run(
      `INSERT INTO organizations (id, name, domain, website, kind, industry, notes, created_at, updated_at)
       VALUES ('org-1', 'northwind.example', 'northwind.example', NULL, 'lead', NULL, NULL, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, domain, origin, status, organization_id, created_at, completed_at)
       VALUES ('scan-1', 'northwind.example', 'https://northwind.example', 'complete', 'org-1', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, evidence_json, schema_types_json)
       VALUES ('page-1', 'scan-1', 'https://northwind.example/', ?, '["LocalBusiness"]')`,
      [JSON.stringify({ businessName: "Northwind", description: "We build yards.", emails: ["ada@northwind.example"], phones: [] })],
    );
    await sql.run(
      `INSERT INTO schema_check_sites (id, check_id, domain, verdict, organization_id, contacts_json, created_at)
       VALUES ('site-1', 'check-1', 'northwind.example', 'needs_us', 'org-1', ?, ?)`,
      [JSON.stringify([{ name: "Ada North", title: "Owner", email: "ada@northwind.example", phone: "+16175550100" }]), NOW],
    );
    const filled = await enrichLeadFromSchema(sql, "org-1", NOW);
    expect(filled.filled).toEqual(expect.arrayContaining(["name", "website", "industry", "notes", "contact"]));
    const org = await sql.get<{ name: string; industry: string; notes: string }>(
      "SELECT name, industry, notes FROM organizations WHERE id = 'org-1'",
    );
    expect(org?.name).toBe("Northwind");
    expect(org?.industry).toBe("Local Business");
    expect(org?.notes).toContain("We build yards.");
    const contact = await sql.get<{ name: string; phone: string; is_primary: number }>(
      "SELECT name, phone, is_primary FROM contacts WHERE organization_id = 'org-1'",
    );
    expect(contact).toMatchObject({ name: "Ada North", phone: "+16175550100", is_primary: 1 });
  });
});
