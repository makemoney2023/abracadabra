export type ParallelExtractResult = {
  url: string;
  title?: string;
  content: string;
  error?: string;
};

export type ParallelSearchResult = {
  url: string;
  title?: string;
  excerpt?: string;
};

export type ParallelLead = {
  name?: string;
  domain: string;
  website?: string;
  industry?: string;
  contacts: Array<{
    name?: string;
    title?: string;
    email?: string;
    phone?: string;
    confidence?: number;
  }>;
  raw: Record<string, unknown>;
};

export interface ParallelClient {
  extract(
    urls: string[],
    opts?: { objective?: string; fullContent?: boolean }
  ): Promise<ParallelExtractResult[]>;
  search(
    objective: string,
    opts: { includeDomains: string[]; maxResults?: number }
  ): Promise<ParallelSearchResult[]>;
  findAllAndEnrich(objective: string): Promise<ParallelLead[]>;
}
