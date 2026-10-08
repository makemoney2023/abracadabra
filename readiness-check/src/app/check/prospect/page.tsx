import { checkPageMetadata } from "@/lib/seo/check-metadata";

const HQ = "https://hq.abra-ca-dabra.app/schema";

export const metadata = checkPageMetadata({
  title: "Schema",
  description: "Schema ops lives in Handoff HQ.",
  path: "/check/prospect",
});

export default function ProspectPage() {
  return (
    <section className="max-w-2xl space-y-5">
      <p className="studio-kicker">Schema</p>
      <h1 className="font-heading text-5xl sm:text-6xl">Schema ops is in HQ</h1>
      <p className="max-w-[46ch] text-lg text-muted-foreground">
        Staff name sites from the Schema item in the Handoff menu. Every site shows a result. A site that needs us becomes a lead.
      </p>
      <a className="studio-cta-primary" href={HQ}>
        Open Schema in HQ
      </a>
    </section>
  );
}
