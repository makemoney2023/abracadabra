export const DEFAULT_HQ_HOST = "hq.abra-ca-dabra.app";

/** The workers.dev staff host still counts as HQ after hq.abra-ca-dabra.app is attached. */
export const STAFF_DEV_HOST = "handoff-hq.abracadabra-ai.workers.dev";

const STAFF_PREFIXES = [
  "/clients",
  "/leads",
  "/projects",
  "/work",
  "/deliverables",
  "/invoices",
  "/spaces",
  "/settings",
];

const CLIENT_PREFIXES = ["/w", "/share", "/invites", "/how-handoff-handles-files"];

const ADMIN_TO_SPACES: Record<string, string> = {
  "/admin": "/spaces",
  "/admin/staff": "/spaces/staff",
  "/admin/templates": "/spaces/templates",
  "/admin/held": "/spaces/held",
  "/admin/workspaces/new": "/spaces/new",
};

export type HostDecision =
  | { kind: "allow" }
  | { kind: "not-found" }
  | { kind: "redirect"; location: string };

export function hostnameOf(hostHeader: string): string {
  return hostHeader.trim().toLowerCase().replace(/:\d+$/, "");
}

export function hqHostName(): string {
  return process.env.HANDOFF_HQ_HOST ?? DEFAULT_HQ_HOST;
}

export function hqOrigin(): string {
  const raw = process.env.HANDOFF_HQ_ORIGIN ?? `https://${DEFAULT_HQ_HOST}`;
  return raw.replace(/\/$/, "");
}

/** Redirects on the staff dev host stay on that host, even when the configured origin is the custom domain. */
export function hqOriginForHost(hostHeader: string): string {
  if (hostnameOf(hostHeader) === STAFF_DEV_HOST) return `https://${STAFF_DEV_HOST}`;
  return hqOrigin();
}

export function handoffOrigin(): string {
  return (process.env.HANDOFF_APP_ORIGIN ?? "").replace(/\/$/, "");
}

export function clientSpaceHref(slug: string): string {
  const origin = handoffOrigin();
  return origin.length > 0 ? `${origin}/w/${slug}` : `/w/${slug}`;
}

export function isHqHost(hostHeader: string, hqHost = hqHostName()): boolean {
  const name = hostnameOf(hostHeader);
  return name === hostnameOf(hqHost) || name === "hq.localhost" || name === STAFF_DEV_HOST;
}

function cleanPath(path: string): string {
  const base = path.split("?")[0] ?? "/";
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base.length > 0 ? base : "/";
}

function hasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function spacesPathForAdmin(path: string): string {
  return ADMIN_TO_SPACES[cleanPath(path)] ?? "/spaces";
}

export function adminPathForSpaces(path: string): string | null {
  const clean = cleanPath(path);
  const found = Object.entries(ADMIN_TO_SPACES).find(([, spaces]) => spaces === clean);
  return found?.[0] ?? null;
}

/** Staff pages answer only on hq. Client folders answer only on the Handoff host. */
export function decideHost(input: {
  host: string;
  path: string;
  hqHost: string;
  hqOrigin: string;
}): HostDecision {
  const path = cleanPath(input.path);
  const hq = isHqHost(input.host, input.hqHost);
  const origin = input.hqOrigin.replace(/\/$/, "");

  if (path === "/admin" || path.startsWith("/admin/")) {
    return { kind: "redirect", location: `${origin}${spacesPathForAdmin(path)}` };
  }
  if (hasPrefix(path, "/api/admin") || hasPrefix(path, "/api/github")) {
    return hq ? { kind: "allow" } : { kind: "not-found" };
  }
  if (STAFF_PREFIXES.some((prefix) => hasPrefix(path, prefix))) {
    return hq ? { kind: "allow" } : { kind: "not-found" };
  }
  if (CLIENT_PREFIXES.some((prefix) => hasPrefix(path, prefix))) {
    return hq ? { kind: "not-found" } : { kind: "allow" };
  }
  return { kind: "allow" };
}
