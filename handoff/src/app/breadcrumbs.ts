export type Crumb = { label: string; href?: string };

const SECTIONS: Record<string, string> = {
  leads: "Leads",
  schema: "Schema",
  work: "Work",
  projects: "Projects",
  clients: "Clients",
  chat: "Chat",
  swarm: "Swarm",
  spaces: "Spaces",
  settings: "Settings",
};

const STATIC: Record<string, string> = {
  github: "GitHub",
  held: "Held files",
  staff: "Staff",
  templates: "Templates",
  new: "New",
  work: "Work",
  drop: "Drop",
  settings: "Settings",
  requests: "Requests",
  people: "People",
  files: "Files",
  batches: "Batches",
  workspaces: "Workspaces",
  shortcuts: "Shortcuts",
  appearance: "Appearance",
};

const MISSING = "…";

function normalize(pathname: string): string {
  const bare = pathname.split(/[?#]/)[0] || "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare.startsWith("/") ? bare : `/${bare}`;
}

function current(label: string): Crumb {
  return { label };
}

function segmentLabel(path: string, segment: string, labels: Record<string, string>): string {
  return labels[path] ?? STATIC[segment] ?? MISSING;
}

function pushTrail(crumbs: Crumb[], parts: string[], start: number, root: string, labels: Record<string, string>) {
  let acc = root;
  for (let i = start; i < parts.length; i += 1) {
    acc += `/${parts[i]}`;
    const label = segmentLabel(acc, parts[i], labels);
    const last = i === parts.length - 1;
    crumbs.push(last ? current(label) : { label, href: acc });
  }
}

function workspaceCrumbs(path: string, labels: Record<string, string>): Crumb[] {
  if (path === "/spaces" || path === "/admin") return [current("Spaces")];
  const crumbs: Crumb[] = [{ label: "Spaces", href: "/spaces" }];
  if (path.startsWith("/admin/")) {
    pushTrail(crumbs, path.split("/").filter(Boolean), 1, "/admin", labels);
    return crumbs;
  }
  const parts = path.split("/").filter(Boolean);
  const slugPath = `/w/${parts[1] ?? ""}`;
  const spaceLabel = labels[slugPath] ?? MISSING;
  if (parts.length <= 2) {
    crumbs.push(current(spaceLabel));
    return crumbs;
  }
  crumbs.push({ label: spaceLabel, href: slugPath });
  pushTrail(crumbs, parts, 2, slugPath, labels);
  return crumbs;
}

/** Breadcrumb trail for an HQ pathname. Record names come from `labels`. */
export function breadcrumbsFor(pathname: string, labels: Record<string, string>): Crumb[] {
  const path = normalize(pathname);
  if (path === "/") return [current("Today")];
  if (path === "/spaces" || path === "/admin" || path.startsWith("/admin/") || path.startsWith("/w/")) {
    return workspaceCrumbs(path, labels);
  }
  const parts = path.split("/").filter(Boolean);
  const section = SECTIONS[parts[0] ?? ""];
  if (!section) return [current(labels[path] ?? MISSING)];
  if (parts.length === 1) return [current(section)];
  const crumbs: Crumb[] = [{ label: section, href: `/${parts[0]}` }];
  pushTrail(crumbs, parts, 1, `/${parts[0]}`, labels);
  return crumbs;
}
