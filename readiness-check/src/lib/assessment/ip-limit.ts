import { createHash } from "node:crypto";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function allowAssessmentCreate(ipHash: string, now = Date.now()): boolean {
  const recent = (hits.get(ipHash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(ipHash, recent);
    return false;
  }
  recent.push(now);
  hits.set(ipHash, recent);
  return true;
}

export function resetAssessmentIpLimit(): void {
  hits.clear();
}

export const ASSESSMENT_IP_LIMIT = LIMIT;
