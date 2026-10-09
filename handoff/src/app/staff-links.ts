export const SWARM_ORIGIN = "https://agent-swarm-orchestrator.abracadabra-ai.workers.dev";

export const STUDIO_NAV_GROUPS = [
  {
    label: "Pulse",
    items: [{ href: "/", label: "Today" }],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/leads", label: "Leads" },
      { href: "/schema", label: "Schema" },
    ],
  },
  {
    label: "Delivery",
    items: [
      { href: "/work", label: "Work" },
      { href: "/projects", label: "Projects" },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/clients", label: "Clients" },
      { href: "/spaces", label: "Spaces" },
    ],
  },
  {
    label: "Automation",
    items: [
      { href: "/chat", label: "Chat" },
      { href: "/swarm", label: "Swarm" },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings/github", label: "GitHub" }],
  },
] as const;

export type StudioNavLink = { readonly href: string; readonly label: string };

/** Flat menu derived from the groups. Href order follows the groups. */
export const STUDIO_NAV: readonly StudioNavLink[] = STUDIO_NAV_GROUPS.flatMap(
  (group): readonly StudioNavLink[] => group.items,
);
