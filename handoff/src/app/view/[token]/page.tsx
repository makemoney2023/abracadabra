import { cookies } from "next/headers";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clock } from "@/lib/clock";
import { PublicLibraryView } from "@/components/library/public-library-view";
import { openViewLink } from "@/lib/library-shares";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = await openHandoffDb();
  await migrate(sql);
  const jar = await cookies();
  const opened = await openViewLink(sql, token, clock(), jar.get("library_view")?.value);
  return <PublicLibraryView token={token} result={opened} />;
}
