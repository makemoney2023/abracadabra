import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clock } from "@/lib/clock";
import { PublicLibraryView } from "@/components/library/public-library-view";
import { clientIpFromHeaders, openViewLink } from "@/lib/library-shares";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const jar = await cookies();
  const headerList = await headers();
  const opened = await openViewLink(sql, token, clock(), jar.get("library_view")?.value, {
    ip: clientIpFromHeaders(headerList),
    userAgent: headerList.get("user-agent"),
  });
  if (!opened.ok && opened.error === "unavailable") notFound();
  return <PublicLibraryView token={token} result={opened} />;
}
