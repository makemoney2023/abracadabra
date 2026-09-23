import { describe, expect, it, vi } from "vitest";
import { createMockParallel } from "@/lib/parallel/mock";
import {
  createInMemoryProspectStore,
  processProspectLeads,
  runProspecting,
} from "@/lib/ops/prospect";

describe("prospect flow", () => {
  it("upserts leads/contacts, queues with missing_contact, enqueues scans", async () => {
    const store = createInMemoryProspectStore();
    const enqueue = vi.fn(async () => {});

    const parallel = createMockParallel({
      findAllAndEnrich: async () => [
        {
          name: "Acme",
          domain: "acme.example",
          website: "https://acme.example",
          industry: "SaaS",
          contacts: [
            {
              name: "Ada",
              title: "CEO",
              email: "ada@acme.example",
              confidence: 0.9,
            },
          ],
          raw: { source: "findall" },
        },
        {
          name: "NoEmail Co",
          domain: "noemail.example",
          website: "https://noemail.example",
          contacts: [{ name: "Bob", title: "VP", phone: "555-0100" }],
          raw: { source: "findall" },
        },
      ],
    });

    const result = await runProspecting(
      { parallel, store, enqueueScan: enqueue },
      "B2B SaaS companies missing schema markup",
    );

    expect(result.leadCount).toBe(2);
    expect(store.leads).toHaveLength(2);
    expect(store.leads.map((l) => l.domain).sort()).toEqual([
      "acme.example",
      "noemail.example",
    ]);

    expect(store.contacts.filter((c) => c.leadId === store.leads[0].id || c.leadId)).toHaveLength(
      2,
    );
    expect(store.contacts.some((c) => c.email === "ada@acme.example")).toBe(true);

    const acmeQueue = store.queue.find(
      (q) => q.leadId === store.leads.find((l) => l.domain === "acme.example")!.id,
    );
    const noEmailQueue = store.queue.find(
      (q) => q.leadId === store.leads.find((l) => l.domain === "noemail.example")!.id,
    );
    expect(acmeQueue?.missingContact).toBe(false);
    expect(noEmailQueue?.missingContact).toBe(true);
    expect(store.queue).toHaveLength(2);

    expect(store.scans).toHaveLength(2);
    expect(store.scans.every((s) => s.source === "ops")).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(result.scanIds).toHaveLength(2);
  });

  it("processProspectLeads upserts by domain on repeat", async () => {
    const store = createInMemoryProspectStore();
    const enqueue = vi.fn(async () => {});

    await processProspectLeads(
      [
        {
          domain: "acme.example",
          name: "Acme",
          contacts: [{ email: "a@acme.example" }],
          raw: {},
        },
      ],
      { store, enqueueScan: enqueue },
    );
    await processProspectLeads(
      [
        {
          domain: "acme.example",
          name: "Acme Updated",
          contacts: [{ email: "b@acme.example" }],
          raw: {},
        },
      ],
      { store, enqueueScan: enqueue },
    );

    expect(store.leads).toHaveLength(1);
    expect(store.leads[0].name).toBe("Acme Updated");
    expect(store.contacts).toHaveLength(1);
    expect(store.contacts[0].email).toBe("b@acme.example");
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
});
