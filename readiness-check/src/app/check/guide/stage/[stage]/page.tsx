import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/check/GuideArticle";
import { guideBySlug, guidesByKind } from "@/content/check-guides";
import { checkPageMetadata } from "@/lib/seo/check-metadata";

export function generateStaticParams() {
  return guidesByKind("stage").map((guide) => ({ stage: guide.slug.replace(/^stage\//, "") }));
}

export async function generateMetadata({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const guide = guideBySlug(`stage/${stage}`);
  if (!guide || guide.kind !== "stage") return {};
  return checkPageMetadata({ title: guide.title, description: guide.answer, path: `/check/guide/stage/${stage}` });
}

export default async function StageGuidePage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  const guide = guideBySlug(`stage/${stage}`);
  if (!guide || guide.kind !== "stage") notFound();
  return <GuideArticle guide={guide} path={`/check/guide/stage/${stage}`} howTo />;
}
