import { CheckFaq, CHECK_FAQ } from "@/components/check/landing/CheckFaq";
import { StartCheck } from "@/components/check/landing/StartCheck";
import { JsonLd } from "@/components/seo/JsonLd";
import { config } from "@/lib/assessment/config";
import { faqPage, webApplicationLd } from "@/lib/seo/json-ld";
import { checkCanonical, checkPageMetadata } from "@/lib/seo/check-metadata";

export const metadata = checkPageMetadata({
  title: "Readiness Check",
  description: config.copy.landingDeck,
  path: "/check",
});

const MEASURE = [
  { title: "Pressure", body: "Which jobs already cap the week, and how costly each one is." },
  { title: "Readiness", body: "Whether the data, the workflow, the owner, and the decision can support real work." },
  { title: "Growth", body: "Where new customers come from, and whether that path is something you control." },
  { title: "Visibility", body: "A live read of how answer engines can find and quote the public site." },
];

export default function CheckLandingPage() {
  const url = checkCanonical("/check");
  return (
    <div className="space-y-16">
      <JsonLd data={faqPage(CHECK_FAQ)} />
      <JsonLd
        data={webApplicationLd({
          name: "Readiness Check",
          url,
          description: config.copy.landingDeck,
        })}
      />
      <section className="max-w-2xl space-y-5">
        <p className="studio-kicker">Abracadabra</p>
        <h1 className="font-heading text-5xl sm:text-6xl">{config.copy.landingTitle}</h1>
        <p className="max-w-[46ch] text-lg text-muted-foreground">{config.copy.landingDeck}</p>
        <StartCheck />
      </section>
      <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="measure-heading">
        <h2 id="measure-heading" className="sr-only">
          What we measure
        </h2>
        {MEASURE.map((item) => (
          <article key={item.title} className="studio-panel space-y-2 p-5">
            <p className="studio-kicker">{item.title}</p>
            <p className="text-sm text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </section>
      <section className="studio-panel max-w-2xl space-y-3 p-5">
        <p className="studio-kicker">What you get</p>
        <h2 className="font-heading text-3xl">A band, four scores, and a next step</h2>
        <p className="text-sm text-muted-foreground">
          Three suggestions in each section, and a thirty-minute working session if you want one. Five to seven minutes.
        </p>
      </section>
      <CheckFaq />
    </div>
  );
}
