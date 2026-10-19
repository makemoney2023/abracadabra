import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LANDING_COPY } from "@/lib/marketing/copy";

export function LandingProblem() {
  return (
    <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
        {LANDING_COPY.problemTitle}
      </h2>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {LANDING_COPY.problemBody}
      </p>
    </section>
  );
}

export function LandingAnalogy() {
  return (
    <section className="space-y-3 border-t border-border pt-12 animate-in fade-in duration-700">
      <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
        {LANDING_COPY.analogyTitle}
      </h2>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
        {LANDING_COPY.analogyBody}
      </p>
    </section>
  );
}

export function LandingHowItWorks() {
  return (
    <section className="space-y-6 border-t border-border pt-12 animate-in fade-in duration-700">
      <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
        {LANDING_COPY.howTitle}
      </h2>
      <div className="studio-connector" aria-hidden="true" />
      <ol className="grid gap-4 sm:grid-cols-3 sm:gap-5">
        {LANDING_COPY.steps.map((step, i) => (
          <li key={step.title} className="studio-card space-y-2 p-5">
            <p className="studio-kicker">Step {i + 1}</p>
            <h3 className="font-heading text-xl tracking-tight">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LandingFaq() {
  return (
    <section className="space-y-4 border-t border-border pt-12 animate-in fade-in duration-700">
      <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">Common questions</h2>
      <Accordion type="single" collapsible className="max-w-2xl">
        {LANDING_COPY.faqs.map((faq, i) => (
          <AccordionItem key={faq.q} value={`faq-${i}`}>
            <AccordionTrigger className="cursor-pointer text-left text-base">
              {faq.q}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

export function LandingFinalCopy() {
  return (
    <div className="space-y-3">
      <h2 className="font-heading text-2xl tracking-tight sm:text-3xl">
        {LANDING_COPY.finalTitle}
      </h2>
      <p className="max-w-lg text-base text-muted-foreground">{LANDING_COPY.finalBody}</p>
    </div>
  );
}
