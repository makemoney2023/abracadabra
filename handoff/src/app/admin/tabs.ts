export const SPACES_TABS = [
  { href: "/spaces", label: "Spaces" },
  { href: "/spaces/held", label: "Held files" },
  { href: "/spaces/staff", label: "Staff" },
  { href: "/spaces/templates", label: "Templates" },
] as const;

export type SpacesTabHref = (typeof SPACES_TABS)[number]["href"];

/** Which Spaces tab is open. Rewritten `/admin` paths count as `/spaces`. */
export function spacesTab(path: string): SpacesTabHref {
  const bare = (path.split("?")[0] ?? "/spaces").replace(/\/$/, "") || "/spaces";
  const current =
    bare === "/admin" || bare.startsWith("/admin/") ? `/spaces${bare.slice("/admin".length)}` : bare;
  if (current === "/spaces/held" || current.startsWith("/spaces/held/")) return "/spaces/held";
  if (current === "/spaces/staff" || current.startsWith("/spaces/staff/")) return "/spaces/staff";
  if (current === "/spaces/templates" || current.startsWith("/spaces/templates/")) return "/spaces/templates";
  return "/spaces";
}
