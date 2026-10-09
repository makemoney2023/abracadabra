/** R2 prefixes in ARTIFACTS that hold per-run data (never skill bodies). */
export const RESET_R2_PREFIXES = ['artifacts/', 'reports/'];

/** Reset is off unless RESET_TOKEN is set, and then needs `Authorization: Bearer <token>`. */
export function isAuthorizedReset(request: Request, token: string | undefined): boolean {
  if (!token) return false;
  return request.headers.get('Authorization') === `Bearer ${token}`;
}

interface ListableBucket {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(keys: string | string[]): Promise<void>;
}

export async function clearR2Prefixes(bucket: ListableBucket, prefixes: string[]): Promise<number> {
  let deleted = 0;
  for (const prefix of prefixes) {
    // Deleting while paging shifts offsets, so re-list from the start until empty.
    for (;;) {
      const page = await bucket.list({ prefix });
      if (page.objects.length === 0) break;
      await bucket.delete(page.objects.map((o) => o.key));
      deleted += page.objects.length;
    }
  }
  return deleted;
}
