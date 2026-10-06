function canonical(path: string): string {
  if (path === "/admin" || path.startsWith("/admin/")) return `/spaces${path.slice("/admin".length)}`;
  return path;
}

export function navIsActive(path: string, href: string): boolean {
  const current = canonical(path);
  if (href === "/") return current === "/";
  return current === href || current.startsWith(`${href}/`);
}
