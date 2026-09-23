import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/check/GuideArticle";
import { guideBySlug, guidesByKind } from "@/content/check-guides";
import { checkPageMetadata } from "@/lib/seo/check-metadata";

export function generateStaticParams() {
  return guidesByKind("fix").map((guide) => ({ code: guide.slug.replace(/^fix\//, "") }));
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const guide = guideBySlug(`fix/${code}`);
  if (!guide) return {};
  return checkPageMetadata({ title: guide.title, description: guide.answer, path: `/check/guide/fix/${code}` });
}

export default async function FixGuidePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const guide = guideBySlug(`fix/${code}`);
  if (!guide || guide.kind !== "fix") notFound();
  return <GuideArticle guide={guide} path={`/check/guide/fix/${code}`} howTo />;
}
