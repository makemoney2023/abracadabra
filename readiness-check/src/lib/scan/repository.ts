export type ScanRecord = {
  id: string;
  domain: string;
  origin: string;
  source: "public" | "ops";
  status: "queued" | "running" | "complete" | "failed";
  leadId?: string | null;
  hasContact?: boolean;
  scoreTotal?: number | null;
  scoreBreakdown?: unknown;
  errorMessage?: string | null;
};

export type ScanPageRecord = {
  url: string;
  pageType: string;
  fetchStatus: string;
  hasJsonLd: boolean;
  schemaTypes: string[];
  evidence?: Record<string, unknown>;
};

export type ScanFindingRecord = {
  code: string;
  severity: string;
  passed: boolean;
  message: string;
  pageUrl?: string;
  evidence?: Record<string, unknown>;
};

export type OpsQueueRecord = {
  leadId: string;
  scanId: string;
  priorityScore: number;
  missingContact: boolean;
};

export interface ScanRepository {
  getScan(scanId: string): Promise<ScanRecord | null>;
  markRunning(scanId: string): Promise<void>;
  savePages(scanId: string, pages: ScanPageRecord[]): Promise<void>;
  saveFindings(scanId: string, findings: ScanFindingRecord[]): Promise<void>;
  markComplete(scanId: string, scoreTotal: number, scoreBreakdown: unknown): Promise<void>;
  markFailed(scanId: string, errorMessage: string): Promise<void>;
  upsertOpsQueue(input: {
    leadId: string;
    scanId: string;
    priorityScore: number;
    missingContact: boolean;
  }): Promise<void>;
}

export type InMemoryScanRepository = ScanRepository & {
  getPages(scanId: string): ScanPageRecord[];
  getFindings(scanId: string): ScanFindingRecord[];
  getOpsQueue(): OpsQueueRecord[];
};

export function createInMemoryScanRepository(initial: ScanRecord[] = []): InMemoryScanRepository {
  const scans = new Map<string, ScanRecord>(initial.map((s) => [s.id, { ...s }]));
  const pages = new Map<string, ScanPageRecord[]>();
  const findings = new Map<string, ScanFindingRecord[]>();
  const opsQueue: OpsQueueRecord[] = [];

  function requireScan(scanId: string): ScanRecord {
    const scan = scans.get(scanId);
    if (!scan) throw new Error(`Scan not found: ${scanId}`);
    return scan;
  }

  return {
    async getScan(scanId) {
      const scan = scans.get(scanId);
      return scan ? { ...scan } : null;
    },

    async markRunning(scanId) {
      const scan = requireScan(scanId);
      scan.status = "running";
      scan.errorMessage = null;
    },

    async savePages(scanId, pageRecords) {
      requireScan(scanId);
      pages.set(
        scanId,
        pageRecords.map((p) => ({
          ...p,
          schemaTypes: [...p.schemaTypes],
          evidence: p.evidence ? { ...p.evidence } : undefined,
        })),
      );
    },

    async saveFindings(scanId, findingRecords) {
      requireScan(scanId);
      findings.set(
        scanId,
        findingRecords.map((f) => ({
          ...f,
          evidence: f.evidence ? { ...f.evidence } : undefined,
        })),
      );
    },

    async markComplete(scanId, scoreTotal, scoreBreakdown) {
      const scan = requireScan(scanId);
      scan.status = "complete";
      scan.scoreTotal = scoreTotal;
      scan.scoreBreakdown = scoreBreakdown;
      scan.errorMessage = null;
    },

    async markFailed(scanId, errorMessage) {
      const scan = requireScan(scanId);
      scan.status = "failed";
      scan.errorMessage = errorMessage;
    },

    async upsertOpsQueue(input) {
      const idx = opsQueue.findIndex((row) => row.leadId === input.leadId);
      const row: OpsQueueRecord = { ...input };
      if (idx >= 0) opsQueue[idx] = row;
      else opsQueue.push(row);
    },

    getPages(scanId) {
      return (pages.get(scanId) ?? []).map((p) => ({
        ...p,
        schemaTypes: [...p.schemaTypes],
        evidence: p.evidence ? { ...p.evidence } : undefined,
      }));
    },

    getFindings(scanId) {
      return (findings.get(scanId) ?? []).map((f) => ({
        ...f,
        evidence: f.evidence ? { ...f.evidence } : undefined,
      }));
    },

    getOpsQueue() {
      return opsQueue.map((row) => ({ ...row }));
    },
  };
}
