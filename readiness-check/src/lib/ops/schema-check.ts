import type { BoundSql } from "@/lib/cloudflare/sql";
import type { SiteReview } from "@/lib/ai-search/prospect";
import { createD1ProspectStore } from "@/lib/ops/d1-prospect-store";
import { processProspectLeads, type ProspectStore } from "@/lib/ops/prospect";
import type { ParallelLead } from "@/lib/parallel/types";
import { insertScan } from "@/lib/scan/d1-store";

export type SchemaReviewer = {
  reviewSites(objective: string): Promise<SiteReview[]>;
};

function verdictOf(review: SiteReview): "needs_us" | "covered" | "unread" {
  if (review.needsUs) return "needs_us";
  if (review.answer.startsWith("Could not") || review.answer.startsWith("Cloudflare")) return "unread";
  return "covered";
}

function asLead(review: SiteReview): ParallelLead {
  return {
    name: review.name,
    domain: review.domain,
    website: review.website,
    contacts: review.contacts.map((contact) => ({
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone: contact.phone,
    })),
    raw: { source: "ai_search", answer: review.answer },
  };
}

export async function ensureSchemaCheck(db: BoundSql, objective: string, checkId?: string): Promise<string> {
  const id = checkId ?? crypto.randomUUID();
  const existing = await db.prepare("SELECT id FROM schema_checks WHERE id = ?").bind(id).first<{ id: string }>();
  if (!existing) {
    await db
      .prepare("INSERT INTO schema_checks (id, objective, status, created_at) VALUES (?, ?, 'queued', ?)")
      .bind(id, objective, Date.now())
      .run();
  }
  return id;
}

export async function runSchemaCheck(
  db: BoundSql,
  input: { objective: string; checkId?: string },
  deps: { reviewer: SchemaReviewer; store?: ProspectStore; enqueueScan: (scanId: string) => Promise<void> },
): Promise<{ checkId: string; leadIds: string[] }> {
  const checkId = await ensureSchemaCheck(db, input.objective, input.checkId);
  await db.prepare("UPDATE schema_checks SET status = 'running', error_message = NULL WHERE id = ?").bind(checkId).run();
  try {
    const reviews = await deps.reviewer.reviewSites(input.objective);
    await db.prepare("DELETE FROM schema_check_sites WHERE check_id = ?").bind(checkId).run();
    const leads = reviews.filter((review) => review.needsUs).map(asLead);
    const filed = await processProspectLeads(leads, {
      store: deps.store ?? createD1ProspectStore(db),
      enqueueScan: deps.enqueueScan,
    });
    const scanByDomain = new Map<string, string>();
    for (let index = 0; index < leads.length; index += 1) {
      const domain = leads[index]?.domain;
      const scanId = filed.scanIds[index];
      if (domain && scanId) scanByDomain.set(domain, scanId);
    }
    for (const review of reviews) {
      if (scanByDomain.has(review.domain)) continue;
      const origin = review.website.replace(/\/$/, "") || `https://${review.domain}`;
      const created = await insertScan(db, { domain: review.domain, origin, source: "ops" });
      await deps.enqueueScan(created.id);
      scanByDomain.set(review.domain, created.id);
    }
    const now = Date.now();
    for (const review of reviews) {
      await db
        .prepare(
          `INSERT INTO schema_check_sites
            (id, check_id, domain, name, website, verdict, answer, organization_id, contacts_json, scan_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          checkId,
          review.domain,
          review.name,
          review.website,
          verdictOf(review),
          review.answer,
          JSON.stringify(review.contacts),
          scanByDomain.get(review.domain) ?? null,
          now,
        )
        .run();
    }
    for (let i = 0; i < leads.length; i += 1) {
      const leadId = filed.leadIds[i];
      const domain = leads[i]?.domain;
      if (!leadId || !domain) continue;
      await db
        .prepare("UPDATE schema_check_sites SET organization_id = ? WHERE check_id = ? AND domain = ?")
        .bind(leadId, checkId, domain)
        .run();
    }
    await db
      .prepare("UPDATE schema_checks SET status = 'complete', completed_at = ? WHERE id = ?")
      .bind(Date.now(), checkId)
      .run();
    return { checkId, leadIds: filed.leadIds };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Schema check failed";
    await db
      .prepare("UPDATE schema_checks SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?")
      .bind(message, Date.now(), checkId)
      .run();
    throw err;
  }
}
