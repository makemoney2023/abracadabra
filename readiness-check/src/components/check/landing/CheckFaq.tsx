export const CHECK_FAQ = [
  {
    q: "How do I know if my business is ready to put AI to work?",
    a: "Take the Readiness Check. It scores where the work slows down, whether the knowledge and the workflow can support a system, where new customers come from, and how readable the website is to answer engines.",
  },
  {
    q: "What does the check measure?",
    a: "Four things: pressure, readiness, growth, and website visibility. Visibility uses a live read of the public site. The other three come from your answers.",
  },
  {
    q: "How long does it take?",
    a: "Five to seven minutes. One question per screen. You can leave and come back with the same link.",
  },
  {
    q: "Do I need a website?",
    a: "The last scored question asks for a public website so we can read it. If that read fails, you still get the rest of the report.",
  },
  {
    q: "What happens after I finish?",
    a: "You leave an email, then see the scores, three suggestions in each section, and a way to book a thirty-minute working session.",
  },
  {
    q: "Is this a diagnosis?",
    a: "No. It is a working picture of the business as you described it, plus a public read of the site. It is not medical, legal, or financial advice.",
  },
];

export function CheckFaq() {
  return (
    <section className="space-y-4" aria-labelledby="check-faq">
      <h2 id="check-faq" className="font-heading text-3xl tracking-tight">
        Questions
      </h2>
      <dl className="space-y-4">
        {CHECK_FAQ.map((item) => (
          <div key={item.q}>
            <dt className="font-medium">{item.q}</dt>
            <dd className="text-sm text-muted-foreground">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
