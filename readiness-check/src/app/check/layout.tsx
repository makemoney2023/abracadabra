import Link from "next/link";

export default function CheckLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/check" className="font-heading text-lg">
            Readiness Check
          </Link>
          <a href="https://abra-ca-dabra.app" className="text-sm text-muted-foreground">
            Abracadabra
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
    </div>
  );
}
