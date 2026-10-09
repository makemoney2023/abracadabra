export const SETTINGS_TABS = [
  { href: "/settings/github", label: "GitHub" },
  { href: "/settings/shortcuts", label: "Shortcuts" },
  { href: "/settings/appearance", label: "Appearance" },
] as const;

export type SettingsTabHref = (typeof SETTINGS_TABS)[number]["href"];

export function settingsTab(path: string): SettingsTabHref {
  const bare = (path.split("?")[0] ?? "/settings/github").replace(/\/$/, "") || "/settings";
  if (bare === "/settings/shortcuts" || bare.startsWith("/settings/shortcuts/")) return "/settings/shortcuts";
  if (bare === "/settings/appearance" || bare.startsWith("/settings/appearance/")) return "/settings/appearance";
  return "/settings/github";
}
