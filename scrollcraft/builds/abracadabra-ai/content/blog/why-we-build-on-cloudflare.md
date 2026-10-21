---
title: "Why We Build on Cloudflare: Security, AI and the Edge"
description: "Our site, our Readiness Check and HQ all run on Cloudflare. Here is what the platform gives us for safety, AI tools, data and cost, with sources."
datePublished: "2026-10-21"
dateModified: "2026-10-21"
pillar: "AI consulting and implementation"
cluster: "platform"
primaryQuery: "why build on Cloudflare"
author: abracadabra-studio
cta: "Is your business ready to put AI to work? Take the five-to-seven-minute Readiness Check."
images:
  - src: /blog/media/why-we-build-on-cloudflare/01.webp
    file: why-we-build-on-cloudflare-01.jpg
    alt: "A dark software screen where an Incoming traffic panel, with one request marked Blocked, connects to a Security checks panel listing DDoS, WAF rules, Bot check and TLS, which connects to a Your app panel marked Protected"
    caption: "Every request is checked before it reaches the app."
    prompt: "Stylized dark-mode software UI in the service-image style: an Incoming traffic panel with one row marked Blocked, joined by a thin cyan connector to a Security checks panel listing DDoS, WAF rules, Bot check and TLS with Passed and Challenged pills, joined to a Your app panel with a green Protected pill. No logos."
  - src: /blog/media/why-we-build-on-cloudflare/02.webp
    file: why-we-build-on-cloudflare-02.jpg
    alt: "An Agent panel marked Working, joined by thin connector lines to four tool cards labelled Models, Gateway, Search and Browser, each with its own status pill"
    prompt: "Stylized dark-mode software UI in the service-image style: an Agent panel with a cyan Working pill, joined by thin cyan connectors to four tool cards labelled Models, Gateway, Search and Browser with Ready, Cached, Indexed and Running pills. No logos."
  - src: /blog/media/why-we-build-on-cloudflare/03.webp
    file: why-we-build-on-cloudflare-03.jpg
    alt: "An Edge app panel marked Live with a dotted world map, joined to panels for a SQL database, file storage, a job queue marked Queued, and a usage card marked Pay for use"
    prompt: "Stylized dark-mode software UI in the service-image style: an Edge app panel with a green Live pill and a dotted world map, joined by thin cyan connectors to SQL database, File storage and Job queue panels and a usage card with a green Pay for use pill. No logos."
diagrams:
  - src: /blog/media/why-we-build-on-cloudflare/stack.svg
    alt: "Representative diagram of our stack: visitors pass through the Cloudflare network edge, with DDoS protection, the WAF, bot checks and TLS, to four Workers apps. The marketing site serves files, the chat uses Workers AI, Durable Objects and Turnstile, the Readiness Check uses a D1 database and a queue, and HQ uses D1, R2 file storage, Workers AI and AI Gateway, with agents built on the Agents SDK"
    caption: "Representative diagram of how our own apps sit on Cloudflare, simplified. Names match our setup files; no client data is shown."
  - src: /blog/media/why-we-build-on-cloudflare/request-path.svg
    alt: "Representative diagram of the checks a request passes on the way in: encrypted with TLS, screened for DDoS attacks, matched against WAF rules, scored for bots, checked by Turnstile on forms, and checked by Access for staff tools, before it reaches the app"
    caption: "Representative diagram of the security layers in front of an app. Which layers apply depends on the plan and the setup."
faqs:
  - question: "Why does Abracadabra build on Cloudflare?"
    answer: "Because one platform gives us the safety, the AI tools, the database, the file storage and the global network. We spend our time on the client's work, not on servers."
  - question: "Is Cloudflare only for big companies?"
    answer: "No. Cloudflare docs list free plans for many of these tools, and the paid Workers plan starts at a small monthly charge. Larger plans add more controls."
  - question: "Do you use every Cloudflare AI tool?"
    answer: "No. Today we use Workers AI, AI Gateway and the Agents SDK. We pick tools like Vectorize, AI Search and Browser Run when a job needs them."
  - question: "What is AI Search, and what happened to AutoRAG?"
    answer: "AI Search is the new name for AutoRAG. Cloudflare renamed it in its changelog. It lets an app or agent search your own files in plain words."
  - question: "How do I know if my business is ready to put AI to work?"
    answer: "Take the Readiness Check. In five to seven minutes it gives you a band and four scores: pressure, readiness, growth, and website visibility from a live read of your public site. You also get three suggestions in each section."
citations:
  - id: cf-workers
    title: "Cloudflare Workers: Overview"
    url: "https://developers.cloudflare.com/workers/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-10-08"
    figures: []
  - id: cf-ddos
    title: "Cloudflare DDoS Protection: Overview"
    url: "https://developers.cloudflare.com/ddos-protection/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-14"
    figures: []
  - id: cf-waf
    title: "Cloudflare Web Application Firewall: Overview"
    url: "https://developers.cloudflare.com/waf/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-19"
    figures: []
  - id: cf-bots
    title: "Cloudflare bot solutions: Overview"
    url: "https://developers.cloudflare.com/bots/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-30"
    figures: []
  - id: cf-ssl
    title: "Cloudflare SSL/TLS: Overview"
    url: "https://developers.cloudflare.com/ssl/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-14"
    figures: []
  - id: cf-turnstile
    title: "Cloudflare Turnstile: Overview"
    url: "https://developers.cloudflare.com/turnstile/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-14"
    figures: []
  - id: cf-one
    title: "Cloudflare One: Overview"
    url: "https://developers.cloudflare.com/cloudflare-one/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-10-12"
    figures: []
  - id: cf-workers-ai
    title: "Cloudflare Workers AI: Overview"
    url: "https://developers.cloudflare.com/workers-ai/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-21"
    figures: []
  - id: cf-ai-gateway
    title: "Cloudflare AI Gateway: Overview"
    url: "https://developers.cloudflare.com/ai-gateway/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-20"
    figures: []
  - id: cf-agents
    title: "Build Agents on Cloudflare"
    url: "https://developers.cloudflare.com/agents/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-09-18"
    figures: []
  - id: cf-vectorize
    title: "Cloudflare Vectorize: Overview"
    url: "https://developers.cloudflare.com/vectorize/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-21"
    figures: []
  - id: cf-ai-search-rename
    title: "AI Search (formerly AutoRAG) now with More Models To Choose From"
    url: "https://developers.cloudflare.com/changelog/post/2025-09-25-ai-search-more-models/"
    publisher: "Cloudflare Changelog"
    datePublished: "2025-09-25"
    figures: []
  - id: cf-ai-search
    title: "Cloudflare AI Search: Overview"
    url: "https://developers.cloudflare.com/ai-search/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-10-01"
    figures: []
  - id: cf-browser-run
    title: "Browser Run: give your agents a browser"
    url: "https://blog.cloudflare.com/browser-run-for-ai-agents/"
    publisher: "Cloudflare Blog"
    datePublished: "2026-04-15"
    figures: []
  - id: cf-browser-run-docs
    title: "Browser Run: Overview"
    url: "https://developers.cloudflare.com/browser-run/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-11"
    figures: []
  - id: cf-crawl-control
    title: "AI Crawl Control: Overview"
    url: "https://developers.cloudflare.com/ai-crawl-control/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-08-14"
    figures: []
  - id: cf-d1
    title: "Cloudflare D1: Overview"
    url: "https://developers.cloudflare.com/d1/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-30"
    figures: ["1", "30"]
  - id: cf-r2
    title: "Cloudflare R2: Overview"
    url: "https://developers.cloudflare.com/r2/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-10-01"
    figures: ["2"]
  - id: cf-durable-objects
    title: "Cloudflare Durable Objects: Overview"
    url: "https://developers.cloudflare.com/durable-objects/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-07-15"
    figures: []
  - id: cf-queues
    title: "Cloudflare Queues: Overview"
    url: "https://developers.cloudflare.com/queues/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-04-21"
    figures: []
  - id: cf-network
    title: "Cloudflare Global Network"
    url: "https://www.cloudflare.com/network/"
    publisher: "Cloudflare"
    figures: ["95", "50"]
  - id: cf-pricing
    title: "Workers pricing"
    url: "https://developers.cloudflare.com/workers/platform/pricing/"
    publisher: "Cloudflare Docs"
    datePublished: "2026-10-02"
    figures: ["5"]
---
Here is the short answer. We build on Cloudflare® because one platform gives us the safety, the AI tools, the data and the global network our work needs. Our own site, our Readiness Check and HQ, the app we use to run client work, all run on it. That lets us spend our time on the job in front of us, not on servers.

This note walks through the three reasons. First comes the safety you get by default. Next are the AI tools, and last is the platform itself, with what it costs. Each claim links to a Cloudflare page, and we say plainly which tools we use today and which we only plan to use. If you want to know whether your business is ready to put AI to work, the [Readiness Check](https://check.abra-ca-dabra.app/check) takes five to seven minutes.

<!--diagram:1-->

## What do we actually run on Cloudflare?

Every app we run lives on Cloudflare Workers®, which is code that runs on the Cloudflare network instead of on one server.[^cf-workers] Our marketing site is a Worker that serves its pages and talks to a second Worker for the chat. The chat uses Workers AI® for speech to text, Durable Objects™ to hold each chat, and Turnstile to keep bots out.

The Readiness Check is its own Worker. It keeps results in a D1 database and hands longer reads of a website to a queue, so a big job does not hold up the page. HQ is a Worker too. It uses D1 for its records, R2 to store files, and Workers AI and AI Gateway for its AI calls. The agents behind HQ are built on the Cloudflare Agents SDK. If you want the full story of how work moves through HQ, read [how client work moves through HQ and our AI agents](/blog/how-client-work-flows-through-hq).

## What safety comes built in?

Most of it is on before we write a line of code. Cloudflare finds and stops DDoS attacks on its own, and its docs say this is on for all plans.[^cf-ddos] A DDoS attack is a flood of fake traffic meant to knock a site over. When the site sits behind Cloudflare, that flood hits the Cloudflare network first.

The WAF, or web app firewall, checks each request against sets of rules and filters out the bad ones.[^cf-waf] You can turn on managed rules that Cloudflare keeps up to date, and add your own rules and rate limits. Bot tools sort real people from scripts that scrape content or try stolen passwords.[^cf-bots] Free plans get a simple bot switch, and Enterprise plans get a score for each request.

<!--diagram:2-->

TLS is the lock in your browser bar. Cloudflare issues free certificates through Universal SSL, so traffic between visitors and the site is encrypted.[^cf-ssl] For our chat we use Turnstile, which checks that a visitor is a person without making them solve a puzzle.[^cf-turnstile] The chat asks for a Turnstile pass when it opens, and a fresh one before each voice call.

For tools only our team should reach, there is Zero Trust. Cloudflare One checks who you are before it lets each request in, instead of trusting anyone who is already inside the network.[^cf-one] Its Access tool guards the private tool server that HQ connects to, and HQ shows a service token to get in.

## Which AI tools does Cloudflare offer?

Cloudflare now has a full set of AI tools that run on the same network as the app. Workers AI runs open models on Cloudflare's GPUs, and you pay for what you use.[^cf-workers-ai] We use it in HQ and in our chat. AI Gateway sits between an app and the models it calls. It logs each call, shows cost, caches answers, limits rates, and can retry or fall back to a second model when one fails.[^cf-ai-gateway] HQ sends its AI calls through it.

The Agents SDK is how we build agents. Cloudflare says each agent gets its own lasting identity, its own SQL storage, live connections and scheduled work.[^cf-agents] That is a good fit for agents that keep working on a task over days, which is what ours do.

<!--image:2-->

There are more tools we reach for when a job needs them. We do not use these in our own stack today. Vectorize is a vector database, which stores what text or images mean so an app can find close matches.[^cf-vectorize] AI Search, which used to be called AutoRAG, was renamed in Cloudflare's changelog.[^cf-ai-search-rename] It lets an app or an agent search its own files in plain words, with keyword and meaning search turned on together.[^cf-ai-search] Browser Run, which used to be called Browser Rendering, runs real browsers on the network so code or agents can read pages, take screenshots and fill in forms.[^cf-browser-run][^cf-browser-run-docs]

AI Crawl Control works the other way round. It shows which AI services are reading your site, lets you allow or block each crawler, and tracks which ones follow your robots.txt file.[^cf-crawl-control] That matters for AI search, and it ties into the work we do on [AI visibility](/services/ai-visibility/) and files like [llms.txt](/blog/what-is-llms-txt).

<!--cta:inline-->

## Why Workers, D1, R2 and Durable Objects?

Each one does a plain job, and they all plug into a Worker with a few lines of setup. D1 is a SQL database that the docs say you can roll back to any minute in the last 30 days.[^cf-d1] R2 stores files and does not charge to send them out to the web.[^cf-r2] Durable Objects pair a bit of code with its own storage, so a chat or an agent keeps its state in one place.[^cf-durable-objects] Queues let one Worker hand a job to another and make sure it gets done.[^cf-queues]

This is how the Readiness Check handles longer reads of a website, so they do not make you wait. The page hands the job to a queue, and Workers pick it up in small parts. The results land in D1, and the page reads them back as they come in.

<!--image:3-->

## How fast is the network?

Cloudflare says that 95% of people online are within 50 milliseconds of one of its data centers.[^cf-network] That is Cloudflare's own figure, not one we measured. What we can say is how it shapes our work. Our code runs close to the visitor by default, so we do not pick a region or move servers when a client grows.

## What does it cost?

It starts small. The Workers paid plan has a minimum charge of $5 a month per account, with usage above that billed as you go.[^cf-pricing] The same page says requests for static files, like images and pages, are free, and there is no charge for data sent out. The free plan also includes some use each day. Prices change, so check the pricing page before you plan a budget.

For our clients, the point is that cost tracks use. A new tool does not need a big server bill on day one. It can start small and grow, and the bill grows with it.

## Should your business build on Cloudflare?

If you need a custom app, an AI assistant, or an agent that does real work, it is a strong place to start. We build [custom apps](/services/custom-apps/), [AI assistants and agents](/services/ai-assistants-and-agents/), and [one bill for many AI models](/services/any-model-one-bill/), and we build them on the stack in this note. If you are still deciding between a product and a build, read [off-the-shelf AI or custom software](/blog/off-the-shelf-ai-or-custom-software).

The first step is knowing where you stand. The [Readiness Check](https://check.abra-ca-dabra.app/check) takes five to seven minutes. It looks at the jobs that eat your week, whether your data and workflow can support real work, where new customers come from, and how well answer engines can find and quote your public site. You get a band, four scores and three suggestions in each section, plus a thirty-minute working session if you want one. Take it, then [start a project](/start/) or write to houdini@abra-ca-dabra.app, and we will look at the results with you.

Cloudflare, the Cloudflare logo, Cloudflare Workers, Workers AI and Durable Objects are trademarks and/or registered trademarks of Cloudflare, Inc. in the United States and other places. This note is our own view and is not endorsed by Cloudflare.
