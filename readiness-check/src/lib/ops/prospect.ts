import { nanoid } from "nanoid";
import { normalizeDomain } from "@/lib/domain";
import type { ParallelClient, ParallelLead } from "@/lib/parallel/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProspectLeadRow = {
  id: string;
  name: string | null;
  domain: string;
  website: string | null;
  industry: string | null;
  source: string;
  raw: Record<string, unknown>;
};

export type ProspectContactRow = {
  id: string;
  leadId: string;
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  confidence: number | null;
};

export type ProspectQueueRow = {
  id: string;
  leadId: string;
  missingContact: boolean;
  latestScanId: string | null;
  status: "new";
};

export type ProspectScanRow = {
  id: string;
  leadId: string;
  domain: string;
  origin: string;
  source: "ops";
  status: "queued";
  publicToken: string;
};

export type ProspectStore = {
  upsertLeadFromParallel(lead: ParallelLead): Promise<ProspectLeadRow>;
  replaceContacts(
    leadId: string,
    contacts: ParallelLead["contacts"],
  ): Promise<void>;
  ensureQueue(leadId: string, missingContact: boolean): Promise<void>;
  createOpsScan(input: {
    leadId: string;
    domain: string;
    origin: string;
  }): Promise<ProspectScanRow>;
  linkQueueScan(leadId: string, scanId: string): Promise<void>;
};

export type InMemoryProspectStore = ProspectStore & {
  leads: ProspectLeadRow[];
  contacts: ProspectContactRow[];
  queue: ProspectQueueRow[];
  scans: ProspectScanRow[];
};

function newId(): string {
  return crypto.randomUUID();
}

function hasEmailContact(contacts: ParallelLead["contacts"]): boolean {
  return contacts.some((c) => Boolean(c.email?.trim()));
}

export function createInMemoryProspectStore(): InMemoryProspectStore {
  const leads: ProspectLeadRow[] = [];
  const contacts: ProspectContactRow[] = [];
  const queue: ProspectQueueRow[] = [];
  const scans: ProspectScanRow[] = [];

  return {
    leads,
    contacts,
    queue,
    scans,
    async upsertLeadFromParallel(lead) {
      const { domain, origin } = normalizeDomain(lead.website || lead.domain);
      const existing = leads.find((l) => l.domain === domain);
      if (existing) {
        existing.name = lead.name ?? existing.name;
        existing.website = lead.website ?? origin;
        existing.industry = lead.industry ?? existing.industry;
        existing.raw = lead.raw ?? existing.raw;
        return existing;
      }
      const row: ProspectLeadRow = {
        id: newId(),
        name: lead.name ?? null,
        domain,
        website: lead.website ?? origin,
        industry: lead.industry ?? null,
        source: "findall",
        raw: lead.raw ?? {},
      };
      leads.push(row);
      return row;
    },
    async replaceContacts(leadId, next) {
      for (let i = contacts.length - 1; i >= 0; i--) {
        if (contacts[i].leadId === leadId) contacts.splice(i, 1);
      }
      for (const c of next) {
        contacts.push({
          id: newId(),
          leadId,
          name: c.name ?? null,
          title: c.title ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          confidence: c.confidence ?? null,
        });
      }
    },
    async ensureQueue(leadId, missingContact) {
      const existing = queue.find((q) => q.leadId === leadId);
      if (existing) {
        existing.missingContact = missingContact;
        return;
      }
      queue.push({
        id: newId(),
        leadId,
        missingContact,
        latestScanId: null,
        status: "new",
      });
    },
    async createOpsScan(input) {
      const row: ProspectScanRow = {
        id: newId(),
        leadId: input.leadId,
        domain: input.domain,
        origin: input.origin,
        source: "ops",
        status: "queued",
        publicToken: nanoid(24),
      };
      scans.push(row);
      return row;
    },
    async linkQueueScan(leadId, scanId) {
      const q = queue.find((row) => row.leadId === leadId);
      if (q) q.latestScanId = scanId;
    },
  };
}

/** Minimal admin client surface used by the Supabase-backed store. */
export type ProspectAdminClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export function createSupabaseProspectStore(
  client: ProspectAdminClient,
): ProspectStore {
  return {
    async upsertLeadFromParallel(lead) {
      const { domain, origin } = normalizeDomain(lead.website || lead.domain);
      const { data, error } = await client
        .from("leads")
        .upsert(
          {
            domain,
            website: lead.website ?? origin,
            name: lead.name ?? null,
            industry: lead.industry ?? null,
            source: "findall",
            raw: lead.raw ?? {},
            updated_at: new Date().toISOString(),
          },
          { onConflict: "domain" },
        )
        .select("id, name, domain, website, industry, source, raw")
        .single();
      if (error || !data) {
        throw new Error(`Lead upsert failed: ${error?.message ?? "unknown"}`);
      }
      return {
        id: data.id as string,
        name: (data.name as string | null) ?? null,
        domain: data.domain as string,
        website: (data.website as string | null) ?? null,
        industry: (data.industry as string | null) ?? null,
        source: (data.source as string) ?? "findall",
        raw: (data.raw as Record<string, unknown>) ?? {},
      };
    },
    async replaceContacts(leadId, next) {
      const { error: delError } = await client
        .from("contacts")
        .delete()
        .eq("lead_id", leadId);
      if (delError) {
        throw new Error(`Contact delete failed: ${delError.message}`);
      }
      if (next.length === 0) return;
      const { error: insError } = await client.from("contacts").insert(
        next.map((c) => ({
          lead_id: leadId,
          name: c.name ?? null,
          title: c.title ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          confidence: c.confidence ?? null,
        })),
      );
      if (insError) {
        throw new Error(`Contact insert failed: ${insError.message}`);
      }
    },
    async ensureQueue(leadId, missingContact) {
      const { data: existing, error: lookupError } = await client
        .from("ops_queue")
        .select("id")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (lookupError) {
        throw new Error(`Ops queue lookup failed: ${lookupError.message}`);
      }
      if (!existing) {
        const { error } = await client.from("ops_queue").insert({
          lead_id: leadId,
          status: "new",
          missing_contact: missingContact,
        });
        if (error) throw new Error(`Ops queue insert failed: ${error.message}`);
        return;
      }
      const { error } = await client
        .from("ops_queue")
        .update({ missing_contact: missingContact })
        .eq("lead_id", leadId);
      if (error) throw new Error(`Ops queue update failed: ${error.message}`);
    },
    async createOpsScan(input) {
      const publicToken = nanoid(24);
      const { data, error } = await client
        .from("scans")
        .insert({
          domain: input.domain,
          origin: input.origin,
          source: "ops",
          status: "queued",
          public_token: publicToken,
          lead_id: input.leadId,
        })
        .select("id, domain, origin, source, status, public_token, lead_id")
        .single();
      if (error || !data) {
        throw new Error(`Scan create failed: ${error?.message ?? "unknown"}`);
      }
      return {
        id: data.id as string,
        leadId: data.lead_id as string,
        domain: data.domain as string,
        origin: data.origin as string,
        source: "ops",
        status: "queued",
        publicToken: data.public_token as string,
      };
    },
    async linkQueueScan(leadId, scanId) {
      const { error } = await client
        .from("ops_queue")
        .update({ latest_scan_id: scanId })
        .eq("lead_id", leadId);
      if (error) throw new Error(`Queue scan link failed: ${error.message}`);
    },
  };
}

export type ProcessProspectDeps = {
  store: ProspectStore;
  enqueueScan: (scanId: string) => Promise<void>;
};

export async function processProspectLeads(
  leads: ParallelLead[],
  deps: ProcessProspectDeps,
): Promise<{ leadIds: string[]; scanIds: string[]; leadCount: number }> {
  const leadIds: string[] = [];
  const scanIds: string[] = [];

  for (const lead of leads) {
    const row = await deps.store.upsertLeadFromParallel(lead);
    leadIds.push(row.id);

    const contacts = lead.contacts ?? [];
    await deps.store.replaceContacts(row.id, contacts);

    const missingContact = !hasEmailContact(contacts);
    await deps.store.ensureQueue(row.id, missingContact);

    const { domain, origin } = normalizeDomain(row.website || row.domain);
    const scan = await deps.store.createOpsScan({
      leadId: row.id,
      domain,
      origin,
    });
    await deps.store.linkQueueScan(row.id, scan.id);
    await deps.enqueueScan(scan.id);
    scanIds.push(scan.id);
  }

  return { leadIds, scanIds, leadCount: leadIds.length };
}

export type RunProspectingDeps = {
  parallel: ParallelClient;
  store: ProspectStore;
  enqueueScan: (scanId: string) => Promise<void>;
};

export async function runProspecting(
  deps: RunProspectingDeps,
  objective: string,
): Promise<{ leadCount: number; scanIds: string[]; leadIds: string[] }> {
  const leads = await deps.parallel.findAllAndEnrich(objective);
  return processProspectLeads(leads, {
    store: deps.store,
    enqueueScan: deps.enqueueScan,
  });
}

/** Production helper: admin store + Inngest enqueue via callback. */
export function createDefaultProspectStore() {
  return createSupabaseProspectStore(createAdminClient());
}
