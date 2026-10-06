import Link from "next/link";

export function StaffNav() {
  return (
    <nav className="flex flex-wrap gap-4 text-sm">
      <Link href="/leads">Leads</Link>
      <Link href="/clients">Clients</Link>
      <Link href="/spaces">Spaces</Link>
    </nav>
  );
}
