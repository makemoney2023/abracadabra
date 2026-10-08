import { ProspectForm } from "@/components/check/ProspectForm";
import { checkPageMetadata } from "@/lib/seo/check-metadata";

export const metadata = checkPageMetadata({
  title: "Prospect",
  description: "Name a site. If it needs Abracadabra, we open a lead and follow up.",
  path: "/check/prospect",
});

export default function ProspectPage() {
  return (
    <section className="max-w-2xl space-y-5">
      <p className="studio-kicker">Prospect</p>
      <h1 className="font-heading text-5xl sm:text-6xl">See if they need us</h1>
      <p className="max-w-[46ch] text-lg text-muted-foreground">
        Name the sites. We read each homepage. A business that needs us becomes a lead we follow up on.
      </p>
      <ProspectForm />
    </section>
  );
}
