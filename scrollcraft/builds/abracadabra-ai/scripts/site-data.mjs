/** Facts already published on the studio site, plus the Cloudflare provider list. */

export const MODIFIED = "2026-10-15";

export const offerings = [
  {
    slug: "ai-assistants-and-agents",
    outcome: "AI assistants and agents that remember customers and take actions",
    builtOn: ["Agents SDK", "Durable Objects", "Agent Memory", "Workflows"],
  },
  {
    slug: "answers-from-your-documents",
    outcome: "Answers from your own documents",
    builtOn: ["AI Search", "Vectorize", "R2"],
  },
  {
    slug: "any-model-one-bill",
    outcome: "Any model, one controlled bill",
    builtOn: ["AI Gateway", "Workers AI"],
  },
  {
    slug: "voice-and-realtime-agents",
    outcome: "Voice and real-time AI agents",
    builtOn: ["Realtime", "Workers AI"],
  },
  {
    slug: "web-automation",
    outcome: "Web automation, scraping, PDFs and reports",
    builtOn: ["Browser Run", "Workflows"],
  },
  {
    slug: "safe-code-execution",
    outcome: "Safe execution of AI-written code",
    builtOn: ["Sandboxes", "Containers"],
  },
  {
    slug: "custom-apps",
    outcome: "Custom apps and back offices",
    builtOn: ["Workers", "D1", "R2"],
  },
  {
    slug: "ai-media",
    outcome: "AI media: images, video, transcripts",
    builtOn: ["Workers AI", "Images", "Stream"],
  },
  {
    slug: "ai-visibility",
    outcome: "AI visibility and crawler control",
    builtOn: ["AI Crawl Control", "llms.txt"],
  },
  {
    slug: "search-grounded-research",
    outcome: "Search-grounded research tools",
    builtOn: ["Web Search API"],
  },
];

export const OFFERINGS_KICKER = "Built and deployed on Cloudflare's global network.";
export const OFFERINGS_HEADING = "What we build and run for you.";

/** Cloudflare AI Gateway providers, checked against the Provider Native docs. */
export const gatewayLogos = [
  { name: "Workers AI", file: "workers-ai.svg" },
  { name: "Amazon Bedrock", file: "amazon-bedrock.svg" },
  { name: "Anthropic", file: "anthropic.svg" },
  { name: "Azure OpenAI", file: "azure-openai.svg" },
  { name: "Baseten" },
  { name: "Cartesia" },
  { name: "Cerebras" },
  { name: "Cohere" },
  { name: "Deepgram", file: "deepgram.svg" },
  { name: "DeepSeek", file: "deepseek.svg" },
  { name: "ElevenLabs", file: "elevenlabs.svg" },
  { name: "Fal AI" },
  { name: "Google AI Studio", file: "google-ai-studio.svg" },
  { name: "Google Vertex AI", file: "google-vertex-ai.svg" },
  { name: "Groq" },
  { name: "Hugging Face", file: "hugging-face.svg" },
  { name: "Ideogram" },
  { name: "Mistral AI", file: "mistral.svg" },
  { name: "OpenAI", file: "openai.svg" },
  { name: "OpenRouter", file: "openrouter.svg" },
  { name: "Parallel" },
  { name: "Perplexity", file: "perplexity.svg" },
  { name: "Replicate", file: "replicate.svg" },
  { name: "xAI", light: true },
];

/** Workers AI model families. Wordmarks stand in where no official mark is self-hosted. */
export const familyLogos = [
  { name: "Meta Llama", file: "meta-llama.svg" },
  { name: "Google Gemma" },
  { name: "Mistral", file: "mistral.svg" },
  { name: "Qwen", file: "qwen.svg" },
  { name: "DeepSeek", file: "deepseek.svg" },
  { name: "gpt-oss" },
  { name: "NVIDIA Nemotron", file: "nvidia-nemotron.svg" },
  { name: "Moonshot Kimi", file: "moonshot-kimi.svg" },
  { name: "Zhipu GLM" },
  { name: "IBM Granite", file: "ibm-granite.svg" },
  { name: "Black Forest Labs FLUX" },
  { name: "Stability" },
  { name: "Leonardo" },
  { name: "Whisper" },
  { name: "BAAI" },
];

export const cases = [
  {
    slug: "showdesk",
    name: "Showdesk",
    kind: "product",
    sameAs: "https://www.showdesk-app.com/",
    image: "/assets/showdesk-home.webp",
    imageAlt: "Showdesk, a live-event operations app.",
    summary: "Live events from entry through review, placements, and reports.",
    body: [
      "Showdesk runs a live event from entry through review, placements, and reports.",
      "The homepage film is 44 seconds. One real example on the studio homepage: this operation became Showdesk.",
    ],
  },
  {
    slug: "schema",
    name: "Schema",
    kind: "product",
    sameAs: "https://schema-two.vercel.app/",
    image: "/assets/schema-home.webp",
    imageAlt: "Schema home page: a URL field and an AI visibility check.",
    summary: "An AI-search visibility scorer. Measured scan output stays separate from generated recommendations.",
    body: [
      "Schema scores how visible a site is to answer engines and generates the repair.",
      "Measured scan output stays separate from generated recommendations, so the result never claims more than the scan observed.",
    ],
  },
  {
    slug: "llm-leverage",
    name: "LLM Leverage",
    kind: "course",
    sameAs: "https://llm-leverage-course.vercel.app",
    image: "/assets/llmcourse-home.webp",
    imageAlt: "LLM Leverage course home: a lesson preview and a rollout path.",
    summary: "A self-paced course for better answers from any model, plus a workshop path.",
    body: [
      "LLM Leverage is a self-paced course for better answers from any model, plus a workshop path for a rollout.",
      "The studio homepage states twelve modules, quiz gated at 75 percent.",
    ],
  },
  {
    slug: "canadian-discount-appliances",
    name: "Canadian Discount Appliances",
    kind: "site",
    sameAs: "https://cdastore.vercel.app/",
    image: "/assets/cda-home.webp",
    imageAlt: "Canadian Discount Appliances home: the Kitchener warehouse lot.",
    summary: "A Kitchener appliance warehouse. Condition, warranty, whether it fits the door, delivery you can book, phone as a close.",
    body: [
      "Canadian Discount Appliances is a Kitchener appliance warehouse.",
      "The store answers condition, warranty, and whether it fits the door, then offers a delivery you can book. Phone is a close.",
    ],
  },
  {
    slug: "super-funnel",
    name: "Super Funnel",
    kind: "product",
    sameAs: "https://abra-ca-dabra.app/films.html",
    image: "/assets/superfunnel-getting-started.webp",
    imageAlt: "Super Funnel Getting started film poster.",
    summary: "One associate app. The Getting started film is 66 seconds. The other seven tours are on the films page.",
    body: [
      "Super Funnel is one associate app.",
      "The homepage shows the Getting started film: home dashboard, setup, pipeline, and nav, 66 seconds. The other seven tours are on the films page. There is no separate public app URL.",
    ],
  },
  {
    slug: "pirx",
    name: "pirx.ca",
    kind: "proof",
    sameAs: "https://pirx.ca/",
    summary: "Search Console figures for pirx.ca, pulled 2026-09-23. The page restates those figures and does not extend them.",
    body: [
      "pirx.ca launched with no search history and no answer-engine presence.",
      "Google Search Console, pulled 2026-09-23, recorded 201K search impressions in twelve weeks, 21.8K impressions from Google's Generative AI and AI Overviews surface, and 1.1K clicks.",
      "One article carried 5,400+ AI-surface impressions. The AI-surface count rose from near zero in June to a daily peak over 1,600 by September.",
    ],
  },
];

export const products = [
  {
    slug: "showdesk",
    name: "Showdesk",
    sameAs: "https://www.showdesk-app.com/",
    image: "/assets/showdesk-home.webp",
    imageAlt: "Showdesk, a live-event operations app.",
    description: "Run a live event from entry through review, placements, and reports.",
    caseSlug: "showdesk",
  },
  {
    slug: "schema",
    name: "Schema",
    sameAs: "https://schema-two.vercel.app/",
    image: "/assets/schema-home.webp",
    imageAlt: "Schema home page: a URL field and an AI visibility check.",
    description: "Scores how visible a site is to answer engines and generates the repair. Measured scan output stays separate from generated recommendations.",
    caseSlug: "schema",
  },
  {
    slug: "super-funnel",
    name: "Super Funnel",
    sameAs: "https://abra-ca-dabra.app/films.html",
    image: "/assets/superfunnel-getting-started.webp",
    imageAlt: "Super Funnel Getting started film poster.",
    description: "One associate app. The Getting started film covers the home dashboard, setup, pipeline, and nav in 66 seconds.",
    caseSlug: "super-funnel",
  },
];

export const course = {
  slug: "llm-leverage",
  name: "LLM Leverage",
  sameAs: "https://llm-leverage-course.vercel.app",
  image: "/assets/llmcourse-home.webp",
  imageAlt: "LLM Leverage course home: a lesson preview and a rollout path.",
  description: "A self-paced course for better answers from any model, plus a workshop path. Twelve modules, quiz gated at 75 percent.",
};

export const PLACEHOLDER = "PLACEHOLDER — needs Christopher";

export const placeholders = {
  offering: "Price, timeline, and a client example for this offering are not on the site yet.",
  portfolio: "Client approval to publish additional results, quotes, or a longer case study is not on file.",
  product: "A public price is not on the site, so this page does not list an offer.",
  course: "The public course site says there are 12 modules, but it does not list the module names. The syllabus stays off this page until those names are public.",
};
