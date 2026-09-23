import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import type { CheckGuide } from "@/content/check-guides";
import { articleLd, breadcrumbLd, faqPage, howToLd } from "@/lib/seo/json-ld";
import { checkCanonical } from "@/lib/seo/check-metadata";

export function GuideArticle({ guide, path, howTo }: { guide: CheckGuide; path: string; howTo?: boolean }) {
  const url = checkCanonical(path);
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <JsonLd data={articleLd({ headline: guide.title, description: guide.answer, url })} />
      <JsonLd data={faqPage(guide.faq)} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Readiness Check", url: checkCanonical("/check") },
          { name: guide.title, url },
        ])}
      />
      {howTo ? <JsonLd data={howToLd({ name: guide.title, steps: [guide.strong, guide.first] })} /> : null}
      <h1 className="font-heading text-4xl tracking-tight">{guide.title}</h1>
      <p>{guide.answer}</p>
      <section>
        <h2 className="font-heading text-2xl">What strong looks like</h2>
        <p className="text-muted-foreground">{guide.strong}</p>
      </section>
      <section>
        <h2 className="font-heading text-2xl">What to do first</h2>
        <p className="text-muted-foreground">{guide.first}</p>
      </section>
      <Link href="/check" className="inline-flex min-h-11 items-center underline">
        Start the check
      </Link>
    </article>
  );
}
