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
      [
        { name: "Ada North", title: "Owner", email: "ada@northwind.example" },
        { name: "About Us" },
      ],
      "https://northwind.example/",
    );
    expect(fill.name).toBe("Northwind");
    expect(fill.website).toBe("https://northwind.example/");
    expect(fill.industry).toBe("Local Business");
    expect(fill.notes).toContain("We build yards.");
    expect(fill.notes).toContain("1 Dock St");
    expect(fill.contacts.map((contact) => contact.email)).toEqual(["ada@northwind.example", null]);
    expect(fill.contacts.map((contact) => contact.name)).toEqual(["Ada North", "Northwind"]);
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
    const office = leadFillFromSchema(
      { name: "Renew Impants", domain: "renewimplants.ca", website: "https://www.renewimplants.ca/", industry: null, notes: null },
      {
        businessName: "All-on-4 Dental Implants Ottawa | Renew Implants",
        emails: ["info@renewimplants.ca"],
        phones: ["613-841-6111", "1791565517", "+16138416111", "6138416111", "134.3898442", "8984417525506"],
      },
      [],
      "https://www.renewimplants.ca/",
    );
    expect(office.contacts).toEqual([
      { name: "Renew Implants", title: null, email: "info@renewimplants.ca", phone: "613-841-6111" },
    ]);
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

  it("replaces page-title contacts with the office email and phone", async () => {
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
      `INSERT INTO organizations (id, name, domain, website, kind, created_at, updated_at)
       VALUES ('org-1', 'Renew Impants', 'renewimplants.ca', 'https://www.renewimplants.ca/', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, domain, origin, status, organization_id, created_at, completed_at)
       VALUES ('scan-1', 'renewimplants.ca', 'https://renewimplants.ca', 'complete', 'org-1', ?, ?)`,
      [NOW, NOW],
    );
    const scraped = `<title>All-on-4 Dental Implants Ottawa | Renew Implants</title>
      <a href="tel:613-841-6111">Call</a>
      <a data-cfemail="177e7971785765727972607e7a677b76796364397476" href="/cdn-cgi/l/email-protection">email</a>
      <script src="/assets/scripts.js?v=1791570015"></script>`;
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, evidence_json, schema_types_json)
       VALUES ('page-1', 'scan-1', 'https://renewimplants.ca/', ?, '[]')`,
      [JSON.stringify({
        businessName: "All-on-4 Dental Implants Ottawa | Renew Implants",
        emails: [],
        phones: ["613-841-6111", "1791565517", "+16138416111", "6138416111", "134.3898442"],
        scrapedText: scraped,
      })],
    );
    await sql.run(
      `INSERT INTO contacts (id, organization_id, name, email, phone, is_primary, created_at, updated_at)
       VALUES ('junk-1', 'org-1', 'All-on-4 Dental Implants Ottawa | Renew Implants', NULL, '1791565517', 1, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO contacts (id, organization_id, name, email, phone, is_primary, created_at, updated_at)
       VALUES ('kept', 'org-1', 'Ada North', 'ada@renewimplants.ca', NULL, 0, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO activities (id, organization_id, contact_id, kind, actor_kind, body, created_at)
       VALUES ('act-1', 'org-1', 'junk-1', 'note', 'system', 'Added a page title.', ?)`,
      [NOW],
    );
    await enrichLeadFromSchema(sql, "org-1", NOW);
    const people = await sql.all<{ name: string; email: string | null; phone: string | null; is_primary: number }>(
      "SELECT name, email, phone, is_primary FROM contacts WHERE organization_id = 'org-1' ORDER BY name",
    );
    expect(people).toEqual([
      { name: "Ada North", email: "ada@renewimplants.ca", phone: null, is_primary: 0 },
      { name: "Renew Implants", email: "info@renewimplants.ca", phone: "613-841-6111", is_primary: 1 },
    ]);
    const activity = await sql.get<{ contact_id: string | null }>("SELECT contact_id FROM activities WHERE id = 'act-1'");
    expect(activity?.contact_id).toBeNull();
  });
});
