import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/check/GuideArticle";
import { guideBySlug, guidesByKind } from "@/content/check-guides";
import { checkPageMetadata } from "@/lib/seo/check-metadata";

export function generateStaticParams() {
  return guidesByKind("section").map((guide) => ({ section: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const guide = guideBySlug(section);
  if (!guide || guide.kind !== "section") return {};
  return checkPageMetadata({ title: guide.title, description: guide.answer, path: `/check/guide/${section}` });
}

export default async function SectionGuidePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const guide = guideBySlug(section);
  if (!guide || guide.kind !== "section") notFound();
  return <GuideArticle guide={guide} path={`/check/guide/${section}`} />;
}
