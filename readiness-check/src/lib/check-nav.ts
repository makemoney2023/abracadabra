export const CHECK_NAV = [
  { href: "/check", label: "Readiness Check" },
  { href: "/check/prospect", label: "Prospect" },
] as const;

export function checkNavIsActive(path: string, href: string): boolean {
  if (href === "/check") return path === "/check";
  return path === href || path.startsWith(`${href}/`);
}
