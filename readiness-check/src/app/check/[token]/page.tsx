import type { Metadata } from "next";
import { CheckSession } from "@/components/check/CheckSession";
import { READINESS_META_COPY } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: READINESS_META_COPY.title,
  description: READINESS_META_COPY.description,
  robots: { index: false, follow: false },
};

export default async function CheckTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CheckSession token={token} />;
}
