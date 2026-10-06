import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { OPS_COOKIE, verifyOpsCookie } from "@/lib/ops/session";

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isLogin = pathname === "/ops/login" || pathname.startsWith("/ops/login/");

  if (!isLogin) {
    const password = process.env.CHECK_OPS_PASSWORD ?? "";
    const token = (await cookies()).get(OPS_COOKIE)?.value;
    const valid = await verifyOpsCookie(token, password);
    if (!valid) {
      redirect("/ops/login");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link href="/ops" className="font-heading text-lg tracking-tight">
              Schema Ops
            </Link>
            {!isLogin ? (
              <nav className="flex gap-3 text-sm text-muted-foreground">
                <Link href="/ops" className="hover:text-foreground">
                  Inbox
                </Link>
                <Link href="/ops/prospect" className="hover:text-foreground">
                  Prospect
                </Link>
              </nav>
            ) : null}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Internal
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
