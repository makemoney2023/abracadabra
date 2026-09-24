import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import type { CheckGuide } from "@/content/check-guides";
import { articleLd, breadcrumbLd, faqPage, howToLd } from "@/lib/seo/json-ld";
import { checkCanonical } from "@/lib/seo/check-metadata";

export function GuideArticle({ guide, path, howTo }: { guide: CheckGuide; path: string; howTo?: boolean }) {
  const url = checkCanonical(path);
  return (
    <article className="mx-auto max-w-2xl space-y-8">
      <JsonLd data={articleLd({ headline: guide.title, description: guide.answer, url })} />
      <JsonLd data={faqPage(guide.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Readiness Check", url: checkCanonical("/check") },
          { name: guide.title, url },
        ])}
      />
      {howTo ? <JsonLd data={howToLd({ name: guide.title, steps: [guide.strong, guide.first] })} /> : null}
      <p className="studio-kicker">Guide</p>
      <h1 className="font-heading text-5xl">{guide.title}</h1>
      <p className="max-w-[46ch] text-lg">{guide.answer}</p>
      <section className="studio-panel space-y-2 p-5">
        <h2 className="font-heading text-3xl">What strong looks like</h2>
        <p className="text-sm text-muted-foreground">{guide.strong}</p>
      </section>
      <section className="studio-panel space-y-2 p-5">
        <h2 className="font-heading text-3xl">What to do first</h2>
        <p className="text-sm text-muted-foreground">{guide.first}</p>
      </section>
      <Link href="/check" className="studio-cta-primary">
        Start the check
      </Link>
    </article>
  );
}
