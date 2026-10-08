import { normalizeDomain } from "@/lib/domain";
import type { BoundSql } from "@/lib/cloudflare/sql";
import type { ParallelLead } from "@/lib/parallel/types";
import { insertScan } from "@/lib/scan/d1-store";
import type { ProspectStore } from "@/lib/ops/prospect";

function leadSource(lead: ParallelLead): string {
  return typeof lead.raw.source === "string" && lead.raw.source.trim() ? lead.raw.source : "ai_search";
}

function noteFor(lead: ParallelLead): string | null {
  const answer = lead.raw.answer;
  return typeof answer === "string" && answer.trim() ? answer.trim().slice(0, 2000) : null;
}

export function createD1ProspectStore(db: BoundSql): ProspectStore {
  return {
    async upsertLeadFromParallel(lead) {
      const { domain, origin } = normalizeDomain(lead.website || lead.domain);
      const name = (lead.name ?? domain).trim().slice(0, 200) || domain;
      const now = Date.now();
      const notes = noteFor(lead);
      const existing = await db
        .prepare("SELECT id, kind FROM organizations WHERE domain = ? AND archived_at IS NULL")
        .bind(domain)
        .first<{ id: string; kind: string }>();

      if (existing) {
        await db
          .prepare(
            `UPDATE organizations
             SET name = ?, website = ?, industry = ?, notes = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind(name, lead.website ?? origin, lead.industry ?? null, notes, now, existing.id)
          .run();
        return {
          id: existing.id,
          name,
          domain,
          website: lead.website ?? origin,
          industry: lead.industry ?? null,
          source: leadSource(lead),
          raw: lead.raw ?? {},
        };
      }

      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO organizations
            (id, name, domain, website, industry, kind, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'lead', ?, ?, ?)`,
        )
        .bind(id, name, domain, lead.website ?? origin, lead.industry ?? null, notes, now, now)
        .run();
      await db
        .prepare(
          `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, created_at)
           VALUES (?, ?, 'note', 'system', 'readiness-check', ?, ?)`,
        )
        .bind(crypto.randomUUID(), id, notes ?? "Site needs a follow-up.", now)
        .run();
      return {
        id,
        name,
        domain,
        website: lead.website ?? origin,
        industry: lead.industry ?? null,
        source: leadSource(lead),
        raw: lead.raw ?? {},
      };
    },

    async replaceContacts(leadId, next) {
      await db.prepare("DELETE FROM contacts WHERE organization_id = ?").bind(leadId).run();
      const now = Date.now();
      let primary = true;
      for (const contact of next) {
        const email = contact.email?.trim().toLowerCase() || null;
        await db
          .prepare(
            `INSERT INTO contacts
              (id, organization_id, name, title, email, phone, is_primary, opted_in, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            leadId,
            contact.name ?? null,
            contact.title ?? null,
            email,
            contact.phone ?? null,
            primary ? 1 : 0,
            now,
            now,
          )
          .run();
        primary = false;
      }
    },

    async ensureQueue(leadId) {
      const existing = await db
        .prepare("SELECT id FROM deals WHERE organization_id = ? AND stage = 'new' LIMIT 1")
        .bind(leadId)
        .first<{ id: string }>();
      if (existing) return;
      const now = Date.now();
      await db
        .prepare(
          `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
           VALUES (?, ?, 'Follow up', 'new', 'ai_search', ?, ?)`,
        )
        .bind(crypto.randomUUID(), leadId, now, now)
        .run();
    },

    async createOpsScan(input) {
      const created = await insertScan(db, {
        domain: input.domain,
        origin: input.origin,
        source: "ops",
        organizationId: input.leadId,
      });
      return {
        id: created.id,
        leadId: input.leadId,
        domain: input.domain,
        origin: input.origin,
        source: "ops" as const,
        status: "queued" as const,
        publicToken: created.token,
      };
    },

    async linkQueueScan(leadId, scanId) {
      const now = Date.now();
      await db
        .prepare(
          `UPDATE deals SET next_step = ?, updated_at = ?
           WHERE organization_id = ? AND stage = 'new'`,
        )
        .bind(`Review scan ${scanId}`, now, leadId)
        .run();
    },
  };
}
