export type CheckGuide = {
  slug: string;
  kind: "section" | "band" | "fix";
  title: string;
  answer: string;
  strong: string;
  first: string;
  faq: Array<{ q: string; a: string }>;
};

export const CHECK_GUIDES: CheckGuide[] = [
  {
    "slug": "pressure",
    "kind": "section",
    "title": "Where does the work slow down?",
    "answer": "The pressure section asks which jobs already hurt: experts as the queue, a sale that needs a visit, claims that drift, a site answer engines cannot read. Severity says whether it is a nuisance or a ceiling.",
    "strong": "A strong answer names one or two jobs that cap growth, not a dozen mild annoyances.",
    "first": "Pick the single job that, if it moved this month, would change the week.",
    "faq": [
      {
        "q": "Where does the work slow down?",
        "a": "The pressure section asks which jobs already hurt: experts as the queue, a sale that needs a visit, claims that drift, a site answer engines cannot read. Severity says whether it is a nuisance or a ceiling."
      }
    ]
  },
  {
    "slug": "readiness",
    "kind": "section",
    "title": "Could AI do real work here?",
    "answer": "Readiness scores four things: where the knowledge lives, whether the workflow is written down, who would own a new system, and who decides. A low score is a state, not a grade.",
    "strong": "Strong looks like one system of record, a written workflow someone owns, a named day-to-day owner, and a decision inside the month.",
    "first": "Write the core workflow on one page before you buy or build anything.",
    "faq": [
      {
        "q": "Could AI do real work here?",
        "a": "Readiness scores four things: where the knowledge lives, whether the workflow is written down, who would own a new system, and who decides. A low score is a state, not a grade."
      }
    ]
  },
  {
    "slug": "growth",
    "kind": "section",
    "title": "Where do new customers come from?",
    "answer": "Growth asks how buyers arrive, whether anyone has checked AI answer engines, and who can change the website. A URL at the end starts a structure scan.",
    "strong": "Strong looks like more than one measured channel, a habit of checking how you show up in answers, and a site the team can change.",
    "first": "Search your own product question in one answer engine and save the result.",
    "faq": [
      {
        "q": "Where do new customers come from?",
        "a": "Growth asks how buyers arrive, whether anyone has checked AI answer engines, and who can change the website. A URL at the end starts a structure scan."
      }
    ]
  },
  {
    "slug": "visibility",
    "kind": "section",
    "title": "Can an AI answer engine read your website?",
    "answer": "Visibility is not an opinion. It is the Schema scan: structured data, discovery files, crawl rules, page coverage, and whether pages are written as answers.",
    "strong": "Strong looks like a home page that names the business in structured data, an llms.txt that points at the pages that matter, and a sitemap a crawler can read.",
    "first": "Open the scan and fix the first item on the list. Then run it again.",
    "faq": [
      {
        "q": "Can an AI answer engine read your website?",
        "a": "Visibility is not an opinion. It is the Schema scan: structured data, discovery files, crawl rules, page coverage, and whether pages are written as answers."
      }
    ]
  },
  {
    "slug": "band/early",
    "kind": "band",
    "title": "What does a Early readiness score mean?",
    "answer": "The work that matters still lives in people's heads. The first useful move is to write one workflow down and name who owns it.",
    "strong": "The band describes the state of the business today. It is not a grade and it is not a diagnosis.",
    "first": "Read the three suggestions under your lowest section and do the first one before you book anything.",
    "faq": [
      {
        "q": "What does Early mean?",
        "a": "The work that matters still lives in people's heads. The first useful move is to write one workflow down and name who owns it."
      }
    ]
  },
  {
    "slug": "band/forming",
    "kind": "band",
    "title": "What does a Forming readiness score mean?",
    "answer": "Pieces of the work are written down. A named owner and one system of record are what turn that into something a team can run.",
    "strong": "The band describes the state of the business today. It is not a grade and it is not a diagnosis.",
    "first": "Read the three suggestions under your lowest section and do the first one before you book anything.",
    "faq": [
      {
        "q": "What does Forming mean?",
        "a": "Pieces of the work are written down. A named owner and one system of record are what turn that into something a team can run."
      }
    ]
  },
  {
    "slug": "band/ready",
    "kind": "band",
    "title": "What does a Ready readiness score mean?",
    "answer": "The business can put a new system to work. The open question is which workflow to start with, and who owns it day to day.",
    "strong": "The band describes the state of the business today. It is not a grade and it is not a diagnosis.",
    "first": "Read the three suggestions under your lowest section and do the first one before you book anything.",
    "faq": [
      {
        "q": "What does Ready mean?",
        "a": "The business can put a new system to work. The open question is which workflow to start with, and who owns it day to day."
      }
    ]
  },
  {
    "slug": "band/running",
    "kind": "band",
    "title": "What does a Running readiness score mean?",
    "answer": "A real workflow already uses the tools. The next gain is the job that still waits on one person.",
    "strong": "The band describes the state of the business today. It is not a grade and it is not a diagnosis.",
    "first": "Read the three suggestions under your lowest section and do the first one before you book anything.",
    "faq": [
      {
        "q": "What does Running mean?",
        "a": "A real workflow already uses the tools. The next gain is the job that still waits on one person."
      }
    ]
  },
  {
    "slug": "fix/ready-data-low",
    "kind": "fix",
    "title": "What should we do about start with where the knowledge lives?",
    "answer": "Where the knowledge lives is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Where the knowledge lives is the part that would stall a new system.",
    "faq": [
      {
        "q": "Why does start with where the knowledge lives matter?",
        "a": "Where the knowledge lives is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next."
      }
    ]
  },
  {
    "slug": "fix/ready-data-mid",
    "kind": "fix",
    "title": "What should we do about tighten where the knowledge lives?",
    "answer": "Where the knowledge lives is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Where the knowledge lives is partly in place.",
    "faq": [
      {
        "q": "Why does tighten where the knowledge lives matter?",
        "a": "Where the knowledge lives is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool."
      }
    ]
  },
  {
    "slug": "fix/ready-process-low",
    "kind": "fix",
    "title": "What should we do about start with whether the work is written down?",
    "answer": "Whether the work is written down is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Whether the work is written down is the part that would stall a new system.",
    "faq": [
      {
        "q": "Why does start with whether the work is written down matter?",
        "a": "Whether the work is written down is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next."
      }
    ]
  },
  {
    "slug": "fix/ready-process-mid",
    "kind": "fix",
    "title": "What should we do about tighten whether the work is written down?",
    "answer": "Whether the work is written down is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Whether the work is written down is partly in place.",
    "faq": [
      {
        "q": "Why does tighten whether the work is written down matter?",
        "a": "Whether the work is written down is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool."
      }
    ]
  },
  {
    "slug": "fix/ready-people-low",
    "kind": "fix",
    "title": "What should we do about start with who would own a new system?",
    "answer": "Who would own a new system is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Who would own a new system is the part that would stall a new system.",
    "faq": [
      {
        "q": "Why does start with who would own a new system matter?",
        "a": "Who would own a new system is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next."
      }
    ]
  },
  {
    "slug": "fix/ready-people-mid",
    "kind": "fix",
    "title": "What should we do about tighten who would own a new system?",
    "answer": "Who would own a new system is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Who would own a new system is partly in place.",
    "faq": [
      {
        "q": "Why does tighten who would own a new system matter?",
        "a": "Who would own a new system is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool."
      }
    ]
  },
  {
    "slug": "fix/ready-decision-low",
    "kind": "fix",
    "title": "What should we do about start with who decides and how fast?",
    "answer": "Who decides and how fast is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Who decides and how fast is the part that would stall a new system.",
    "faq": [
      {
        "q": "Why does start with who decides and how fast matter?",
        "a": "Who decides and how fast is the part that would stall a new system. Write down one real example this week: the source, the owner, and the step that happens next."
      }
    ]
  },
  {
    "slug": "fix/ready-decision-mid",
    "kind": "fix",
    "title": "What should we do about tighten who decides and how fast?",
    "answer": "Who decides and how fast is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Who decides and how fast is partly in place.",
    "faq": [
      {
        "q": "Why does tighten who decides and how fast matter?",
        "a": "Who decides and how fast is partly in place. Name the gap in one sentence and pick the person who closes it before you add a tool."
      }
    ]
  },
  {
    "slug": "fix/ready-strong",
    "kind": "fix",
    "title": "What should we do about you can put a system to work?",
    "answer": "Data, process, people, and the decision are far enough along. The useful next step is one workflow, with a named owner, running this quarter.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Data, process, people, and the decision are far enough along.",
    "faq": [
      {
        "q": "Why does you can put a system to work matter?",
        "a": "Data, process, people, and the decision are far enough along. The useful next step is one workflow, with a named owner, running this quarter."
      }
    ]
  },
  {
    "slug": "fix/growth-one-channel",
    "kind": "fix",
    "title": "What should we do about new customers come from one place?",
    "answer": "When referrals are the whole pipeline, a quiet month is a quiet quarter. Write down the one other place buyers already look, and put a page there that answers their question.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "When referrals are the whole pipeline, a quiet month is a quiet quarter.",
    "faq": [
      {
        "q": "Why does new customers come from one place matter?",
        "a": "When referrals are the whole pipeline, a quiet month is a quiet quarter. Write down the one other place buyers already look, and put a page there that answers their question."
      }
    ]
  },
  {
    "slug": "fix/growth-ai-unchecked",
    "kind": "fix",
    "title": "What should we do about aI answer engines are unchecked?",
    "answer": "Ask ChatGPT, Perplexity, and Google the question a buyer would ask, using your product words. Save what comes back. That is the baseline the site scan is measuring.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Ask ChatGPT, Perplexity, and Google the question a buyer would ask, using your product words.",
    "faq": [
      {
        "q": "Why does aI answer engines are unchecked matter?",
        "a": "Ask ChatGPT, Perplexity, and Google the question a buyer would ask, using your product words. Save what comes back. That is the baseline the site scan is measuring."
      }
    ]
  },
  {
    "slug": "fix/growth-site-stuck",
    "kind": "fix",
    "title": "What should we do about the site cannot keep up with the work?",
    "answer": "If a change takes weeks, the pages that should answer buyers stay stale. List the three pages a buyer hits first and who can publish a change to them.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "If a change takes weeks, the pages that should answer buyers stay stale.",
    "faq": [
      {
        "q": "Why does the site cannot keep up with the work matter?",
        "a": "If a change takes weeks, the pages that should answer buyers stay stale. List the three pages a buyer hits first and who can publish a change to them."
      }
    ]
  },
  {
    "slug": "fix/vis-pending",
    "kind": "fix",
    "title": "What should we do about still reading your site?",
    "answer": "The scan is still running. Open the full scan when it finishes. The rest of this check does not wait on it.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "The scan is still running.",
    "faq": [
      {
        "q": "Why does still reading your site matter?",
        "a": "The scan is still running. Open the full scan when it finishes. The rest of this check does not wait on it."
      }
    ]
  },
  {
    "slug": "fix/vis-unavailable",
    "kind": "fix",
    "title": "What should we do about the site scan did not finish?",
    "answer": "We could not score the site this time. Run the scan directly and the visibility section will fill in.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "We could not score the site this time.",
    "faq": [
      {
        "q": "Why does the site scan did not finish matter?",
        "a": "We could not score the site this time. Run the scan directly and the visibility section will fill in."
      }
    ]
  },
  {
    "slug": "fix/no-json-ld-home",
    "kind": "fix",
    "title": "What should we do about no json ld home?",
    "answer": "The home page has no structured data, so answer engines have to guess what the business is. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "The home page has no structured data, so answer engines have to guess what the business is.",
    "faq": [
      {
        "q": "Why does no json ld home matter?",
        "a": "The home page has no structured data, so answer engines have to guess what the business is. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/no-org-schema",
    "kind": "fix",
    "title": "What should we do about no org schema?",
    "answer": "There is no Organization or LocalBusiness markup naming who you are, where you are, and how to reach you. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "There is no Organization or LocalBusiness markup naming who you are, where you are, and how to reach you.",
    "faq": [
      {
        "q": "Why does no org schema matter?",
        "a": "There is no Organization or LocalBusiness markup naming who you are, where you are, and how to reach you. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-faq-schema",
    "kind": "fix",
    "title": "What should we do about missing faq schema?",
    "answer": "The questions buyers ask are not marked up as answers a machine can quote. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "The questions buyers ask are not marked up as answers a machine can quote.",
    "faq": [
      {
        "q": "Why does missing faq schema matter?",
        "a": "The questions buyers ask are not marked up as answers a machine can quote. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-llms-txt",
    "kind": "fix",
    "title": "What should we do about missing llms txt?",
    "answer": "There is no llms.txt file telling an answer engine which pages matter. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "There is no llms.txt file telling an answer engine which pages matter.",
    "faq": [
      {
        "q": "Why does missing llms txt matter?",
        "a": "There is no llms.txt file telling an answer engine which pages matter. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/empty-llms-txt",
    "kind": "fix",
    "title": "What should we do about empty llms txt?",
    "answer": "llms.txt exists but says nothing useful. Name the pages a buyer should read. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "llms.txt exists but says nothing useful.",
    "faq": [
      {
        "q": "Why does empty llms txt matter?",
        "a": "llms.txt exists but says nothing useful. Name the pages a buyer should read. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-llms-full",
    "kind": "fix",
    "title": "What should we do about missing llms full?",
    "answer": "A short llms.txt is present. A fuller llms-full.txt gives answer engines the longer context. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "A short llms.txt is present.",
    "faq": [
      {
        "q": "Why does missing llms full matter?",
        "a": "A short llms.txt is present. A fuller llms-full.txt gives answer engines the longer context. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/sitemap-missing",
    "kind": "fix",
    "title": "What should we do about sitemap missing?",
    "answer": "No sitemap was found, so crawlers have to discover pages by links alone. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "No sitemap was found, so crawlers have to discover pages by links alone.",
    "faq": [
      {
        "q": "Why does sitemap missing matter?",
        "a": "No sitemap was found, so crawlers have to discover pages by links alone. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/sitemap-unparseable",
    "kind": "fix",
    "title": "What should we do about sitemap unparseable?",
    "answer": "A sitemap was found but could not be read. Publish a valid XML sitemap. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "A sitemap was found but could not be read.",
    "faq": [
      {
        "q": "Why does sitemap unparseable matter?",
        "a": "A sitemap was found but could not be read. Publish a valid XML sitemap. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/robots-blocks-gptbot",
    "kind": "fix",
    "title": "What should we do about robots blocks gptbot?",
    "answer": "robots.txt blocks GPTBot, so that answer engine is told to stay out. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "robots.txt blocks GPTBot, so that answer engine is told to stay out.",
    "faq": [
      {
        "q": "Why does robots blocks gptbot matter?",
        "a": "robots.txt blocks GPTBot, so that answer engine is told to stay out. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/robots-blocks-ai-bots",
    "kind": "fix",
    "title": "What should we do about robots blocks ai bots?",
    "answer": "robots.txt blocks one or more AI crawlers. Decide which ones you want reading the site. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "robots.txt blocks one or more AI crawlers.",
    "faq": [
      {
        "q": "Why does robots blocks ai bots matter?",
        "a": "robots.txt blocks one or more AI crawlers. Decide which ones you want reading the site. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/low-json-ld-coverage",
    "kind": "fix",
    "title": "What should we do about low json ld coverage?",
    "answer": "Most pages have no structured data, so the site looks thin to a machine. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Most pages have no structured data, so the site looks thin to a machine.",
    "faq": [
      {
        "q": "Why does low json ld coverage matter?",
        "a": "Most pages have no structured data, so the site looks thin to a machine. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/pages-fetch-failed",
    "kind": "fix",
    "title": "What should we do about pages fetch failed?",
    "answer": "Some important pages could not be fetched. If a buyer cannot load them, neither can a crawler. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Some important pages could not be fetched.",
    "faq": [
      {
        "q": "Why does pages fetch failed matter?",
        "a": "Some important pages could not be fetched. If a buyer cannot load them, neither can a crawler. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-breadcrumb",
    "kind": "fix",
    "title": "What should we do about missing breadcrumb?",
    "answer": "Pages do not say where they sit in the site, which makes the structure harder to quote. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Pages do not say where they sit in the site, which makes the structure harder to quote.",
    "faq": [
      {
        "q": "Why does missing breadcrumb matter?",
        "a": "Pages do not say where they sit in the site, which makes the structure harder to quote. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-howto-schema",
    "kind": "fix",
    "title": "What should we do about missing howto schema?",
    "answer": "Step-by-step pages are not marked as HowTo, so the steps are harder to cite. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Step-by-step pages are not marked as HowTo, so the steps are harder to cite.",
    "faq": [
      {
        "q": "Why does missing howto schema matter?",
        "a": "Step-by-step pages are not marked as HowTo, so the steps are harder to cite. Fix that page first, then rerun the scan."
      }
    ]
  },
  {
    "slug": "fix/missing-product-schema",
    "kind": "fix",
    "title": "What should we do about missing product schema?",
    "answer": "Product pages do not carry Product markup for price, availability, and name. Fix that page first, then rerun the scan.",
    "strong": "Strong looks like the suggestion no longer applies the next time you run the check.",
    "first": "Product pages do not carry Product markup for price, availability, and name.",
    "faq": [
      {
        "q": "Why does missing product schema matter?",
        "a": "Product pages do not carry Product markup for price, availability, and name. Fix that page first, then rerun the scan."
      }
    ]
  }
];

export function guideBySlug(slug: string): CheckGuide | undefined {
  return CHECK_GUIDES.find((g) => g.slug === slug);
}

export function guidesByKind(kind: CheckGuide["kind"]): CheckGuide[] {
  return CHECK_GUIDES.filter((g) => g.kind === kind);
}
