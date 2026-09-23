import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/check/GuideArticle";
import { guideBySlug, guidesByKind } from "@/content/check-guides";
import { checkPageMetadata } from "@/lib/seo/check-metadata";

export function generateStaticParams() {
  return guidesByKind("band").map((guide) => ({ band: guide.slug.replace(/^band\//, "") }));
}

export async function generateMetadata({ params }: { params: Promise<{ band: string }> }) {
  const { band } = await params;
  const guide = guideBySlug(`band/${band}`) ?? guideBySlug(band);
  if (!guide || guide.kind !== "band") return {};
  return checkPageMetadata({ title: guide.title, description: guide.answer, path: `/check/guide/band/${band}` });
}

export default async function BandGuidePage({ params }: { params: Promise<{ band: string }> }) {
  const { band } = await params;
  const guide = guideBySlug(`band/${band}`) ?? guideBySlug(band);
  if (!guide || guide.kind !== "band") notFound();
  return <GuideArticle guide={guide} path={`/check/guide/band/${band}`} howTo />;
}
