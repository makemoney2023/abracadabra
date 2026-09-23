import type { Metadata } from "next";
import { CheckSession } from "@/components/check/CheckSession";

export const metadata: Metadata = {
  title: "Your Readiness Check",
  robots: { index: false, follow: false },
};

export default async function CheckTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CheckSession token={token} />;
}
