/**
 * PAYWALL_TEST_BYPASS — preview/test-only switch that lets file generation run
 * without a paid entitlement, so the generators can be verified end to end.
 *
 * NEVER set this in production. It is ignored unless BOTH are true:
 * 1. PAYWALL_TEST_BYPASS is exactly "1", and
 * 2. the request host is a Worker preview alias (`<alias>-readiness-check.<sub>.workers.dev`)
 *    or a local dev host. The production hosts (check.abra-ca-dabra.app and
 *    readiness-check.<sub>.workers.dev) never qualify, so a version uploaded with the
 *    var that is later promoted still keeps the paywall closed in prod.
 *
 * 3. the request opts in: header `x-paywall-test-bypass: 1` or query `?paywall_test=1`
 *    (so the same preview still shows the normal locked panel by default).
 *
 * Set it only on a preview upload:
 *   wrangler versions upload --preview-alias schema-paywall --var PAYWALL_TEST_BYPASS:1
 */
import type { PaywallEnv } from "@/lib/paywall/config";

export const TEST_BYPASS_TOKEN = "test-bypass";

const WORKER_NAME = "readiness-check";

export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (!host.endsWith(".workers.dev")) return false;
  const first = host.split(".")[0] ?? "";
  // "<alias>-readiness-check" only; bare "readiness-check" is production.
  return first.endsWith(`-${WORKER_NAME}`) && first.length > WORKER_NAME.length + 1;
}

export const TEST_BYPASS_HEADER = "x-paywall-test-bypass";
export const TEST_BYPASS_QUERY = "paywall_test";

export function paywallTestBypass(request: Request, env: PaywallEnv = process.env): boolean {
  if (env.PAYWALL_TEST_BYPASS?.trim() !== "1") return false;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (!isPreviewHost(url.hostname)) return false;
  return request.headers.get(TEST_BYPASS_HEADER) === "1" || url.searchParams.get(TEST_BYPASS_QUERY) === "1";
}
