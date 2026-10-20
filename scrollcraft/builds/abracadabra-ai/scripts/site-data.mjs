/** Facts already published on the studio site, plus the Cloudflare provider list. */

import { pirxCaseShots, pirxHero } from "./pirx-shots.mjs";

export const MODIFIED = "2026-10-15";

export const offerings = [
  {
    slug: "ai-assistants-and-agents",
    outcome: "An assistant that finishes the request",
    card: "Your assistant keeps the conversation, follows your rules, and finishes the request in the tools you already use.",
    whatItIs: "An assistant your customers or your team can talk to. It keeps the thread, follows the rules you set, and can do a small job when the answer is clear: book a time, send a follow-up, or hand the conversation to a person.",
    examples: [
      "Answering common customer questions after hours, and handing off when the question needs a person",
      "Following up on an open request with the status you already have on file",
      "Taking a routine request, such as a booking, a callback, or a form, and filing it where your team already works",
    ],
    steps: [
      "We write down the jobs the assistant is allowed to do, and the ones it must pass to a person.",
      "We connect it to the records it needs, so it is not guessing from a blank page.",
      "It runs on Cloudflare, so the conversation and the memory stay with the request.",
      "You try it on real questions from last week. We tighten the rules before it talks to customers.",
    ],
    deliverables: [
      "The assistant, live, with the jobs it may do written down",
      "A memory of the conversation so the next reply does not start over",
      "A handoff to a person when the request is outside those jobs",
      "A short record of what it did",
    ],
    who: "Owners who are tired of the same questions landing in the same inbox, and who want a first reply that follows the way the business already works.",
    signs: [
      "The same questions arrive every day, and the answer is already known",
      "Customers wait because nobody is watching the inbox after hours",
      "Staff retype the same details into a second tool",
    ],
    faqs: [
      ["Will it invent an answer?", "It answers from the rules and the records you give it. When it does not know, it says so and hands the conversation to a person."],
      ["Can it take actions, or only chat?", "Both, within the jobs you approve. A booking or a status update is an action. Anything outside that list waits for a person."],
      ["Does it remember an earlier conversation?", "Yes, for the customer or the thread you connect. A new person does not see someone else's history."],
      ["What do we have to maintain?", "The rules and the facts. When a policy or a price changes, you update that source. The assistant follows the new version."],
    ],
    builtOn: ["Agents SDK", "Durable Objects", "Agent Memory", "Workflows"],
  },
  {
    slug: "answers-from-your-documents",
    outcome: "Answers from your own documents",
    card: "Ask in plain language. We answer from your files, and every answer carries the page it came from.",
    whatItIs: "A way to ask a plain question and get an answer from your own files: handbooks, policies, price sheets, manuals. The answer points back to the page it came from.",
    examples: [
      "Looking up a part or policy in your own documents",
      "Finding the clause a customer is asking about, without opening ten files",
      "Answering a staff question from the handbook instead of interrupting a manager",
    ],
    steps: [
      "You give us the documents that are allowed to be searched.",
      "We store them and make them searchable, and we leave out anything that should stay private.",
      "The search runs on Cloudflare. A question comes back with the passage it used.",
      "You check a handful of real questions. If the source is wrong, we fix the file, not the sentence.",
    ],
    deliverables: [
      "A search your team or your customers can ask in plain language",
      "Answers that cite the document and the passage",
      "A list of which files are in, and which are out",
      "A way to replace a file when it changes",
    ],
    who: "Teams that already wrote the answer down, and still spend the day hunting for it.",
    signs: [
      "People ask the same question because the file is hard to find",
      "New staff learn by interrupting whoever has been there longest",
      "Customers get a different answer depending on who picks up",
    ],
    faqs: [
      ["Will it answer from the open web?", "No. It answers from the documents you put in."],
      ["What if two documents disagree?", "It shows both passages. You decide which file is current, and we retire the old one."],
      ["Can customers see internal files?", "Only the set you mark for them. Internal files stay on the staff side."],
      ["What file types work?", "The documents you already send around: PDFs, pages, and spreadsheets saved as files. If a format is awkward, we say so before we load it."],
    ],
    builtOn: ["AI Search", "Vectorize", "R2"],
  },
  {
    slug: "any-model-one-bill",
    outcome: "Any model, one controlled bill",
    card: "Each job uses the model that fits it. You get one gateway and one bill you can cap and stop.",
    whatItIs: "Different jobs want different models. This puts them behind one door: you pick the model per job, you see the spend in one place, and you can stop a runaway bill.",
    examples: [
      "Sending everyday questions to a smaller model and harder questions to a stronger one",
      "Capping what a busy week can spend before the invoice surprises you",
      "Switching models when one is slow, without rebuilding the product",
    ],
    steps: [
      "We list the jobs and which model should handle each one.",
      "Traffic goes through one gateway on Cloudflare, so every call is logged the same way.",
      "You set a limit. When the limit is close, the system slows or stops instead of spending quietly.",
      "You read one usage view, not a pile of provider dashboards.",
    ],
    deliverables: [
      "One gateway in front of the models you choose",
      "A per-job choice of model",
      "A spend limit you can change",
      "A usage record you can read",
    ],
    who: "Owners who want the right model for the job and do not want five invoices or a surprise bill.",
    signs: [
      "You are paying more than one model vendor and cannot see the total",
      "A test or a loop spent more than you meant to",
      "You want to try a new model without a rebuild",
    ],
    faqs: [
      ["Do we have to pick one model forever?", "No. The gateway is the stable part. The model behind a job can change."],
      ["Can we set a hard stop on spend?", "Yes. You set the limit. Past that, calls stop or fall back to a cheaper path you approved."],
      ["Does this train a model on our data?", "We do not turn your requests into training data. The providers you choose have their own terms, and we pick the setting that keeps your prompts out of training when that setting exists."],
      ["Is this the product our customers see?", "Usually no. It is the control behind the product: which model runs, what it costs, and when it stops."],
    ],
    builtOn: ["AI Gateway", "Workers AI"],
  },
  {
    slug: "voice-and-realtime-agents",
    outcome: "Voice and real-time AI agents",
    card: "Callers hear an answer from your records. When the call needs a person, we hand it over with a note of what was already said.",
    whatItIs: "A phone or voice conversation that answers in the moment. It listens, replies from the facts you provide, and passes the call to a person when the request needs one.",
    examples: [
      "Answering common customer questions after hours, by voice",
      "Taking a name, a number, and the reason for the call, then filing that note",
      "Transferring the call when the caller asks for a person, or when the question is outside the script",
    ],
    steps: [
      "We write the calls it may handle, and the line it uses to reach a person.",
      "We connect the facts it is allowed to say.",
      "The voice runs on Cloudflare, so the reply stays in the same moment as the caller.",
      "You listen to real calls from a quiet test line before it answers the public number.",
    ],
    deliverables: [
      "A voice agent on the number or the line you choose",
      "A short script of what it may say and what it must not",
      "A transfer to a person",
      "A note of each call: what was asked, and what it did",
    ],
    who: "Owners whose phone still rings with questions a person repeats all day.",
    signs: [
      "After-hours callers leave a message and call again in the morning",
      "Staff spend the first hour returning the same kinds of calls",
      "People hang up when they are put on hold",
    ],
    faqs: [
      ["Will it sound like a person from our team?", "It sounds like a clear voice reading the facts you approved. It does not pretend to be a named employee."],
      ["What if it mishears?", "It confirms the detail that matters, such as a name or a number, before it files anything."],
      ["Can it call out, or only answer?", "We start with answering. Outbound calls are a separate decision, with the list of who may be called."],
      ["Where do the recordings live?", "With the call record you asked us to keep, for as long as you set. We do not keep a recording you did not ask for."],
    ],
    builtOn: ["Realtime", "Workers AI"],
  },
  {
    slug: "web-automation",
    outcome: "Web automation, scraping, PDFs and reports",
    card: "The weekly browser job opens the same pages, collects the same numbers, and leaves a report you can open.",
    whatItIs: "A repeatable job that visits the sites or files you name, collects what you asked for, and turns it into a spreadsheet or a report. It runs on a schedule, or when you press go.",
    examples: [
      "Turning a weekly spreadsheet into a report",
      "Checking a public page for a price, a status, or a change, and writing that down",
      "Filling the same PDF or the same form from a row in a sheet",
    ],
    steps: [
      "You show us the job as you do it once, click by click.",
      "We turn that into a run that opens the pages, reads the fields, and writes the result.",
      "The run happens on Cloudflare, on the schedule you pick.",
      "If a page changes and the run fails, you get the failure, not a silent wrong number.",
    ],
    deliverables: [
      "The automated run, on a schedule or a button",
      "The output you asked for: a sheet, a PDF, or a report",
      "A log of each run: what it opened, what it wrote, and whether it finished",
      "An alert when a run fails",
    ],
    who: "Owners who still do the same browser job every week by hand.",
    signs: [
      "Someone copies numbers from a page into a sheet on a fixed day",
      "A report is late because the person who builds it is out",
      "The steps are the same, and the only change is the date",
    ],
    faqs: [
      ["Can it log into a site that needs a password?", "Only with an account you control, and only for the job you described. We do not share that login with a model provider."],
      ["What if the page layout changes?", "The run stops and tells you. We adjust it. It does not invent the missing number."],
      ["Will it collect someone else's private data?", "No. We automate pages and files you are allowed to use: your own accounts, public pages, and exports you already download."],
      ["How often can it run?", "On the schedule you set: hourly, nightly, weekly, or when you start it."],
    ],
    builtOn: ["Browser Run", "Workflows"],
  },
  {
    slug: "safe-code-execution",
    outcome: "Safe execution of AI-written code",
    card: "When your assistant needs to run a small program, it runs inside a sandbox. Time, files, and access are set before it starts.",
    whatItIs: "Some jobs ask a model to write a small program: a calculation, a file transform, a check. This runs that program in a closed box, so a mistake stays in the box.",
    examples: [
      "Turning a weekly spreadsheet into a calculated report, with the formula run in a box",
      "Checking a file the model produced before anyone downloads it",
      "Letting a teammate ask for a one-off calculation without handing over the keys to the business",
    ],
    steps: [
      "We decide which jobs may write code, and what that code is allowed to see.",
      "The code runs on Cloudflare, inside a sandbox, with no path to the rest of your systems unless you open one.",
      "The result comes back as a file or a number. The box is thrown away.",
      "You see what ran. You do not have to read the program to trust the boundary.",
    ],
    deliverables: [
      "A sandbox for the jobs that need generated code",
      "A list of what the code may read and write",
      "The result of the run, and a record that it ran",
      "A stop if the code asks for something outside the list",
    ],
    who: "Owners who want the speed of generated code and a hard wall around everything else.",
    signs: [
      "A model is already writing snippets that someone pastes into a live tool",
      "You want calculations on your files without uploading the whole business",
      "You do not want a generated script sitting on a laptop with saved passwords",
    ],
    faqs: [
      ["Can the code reach our email or our files?", "Only the files you pass into that run. It does not inherit someone's login."],
      ["What if the code is wrong?", "The box still contains it. You get the output to check, and a bad result does not change live records unless you built that step on purpose."],
      ["Do we review every program?", "You review the job and the boundary. You do not have to review every line for the wall to hold."],
      ["Is this only for developers?", "It is for any job where the useful output is a calculation or a file, and the risk is letting that program wander."],
    ],
    builtOn: ["Sandboxes", "Containers"],
  },
  {
    slug: "machine-learning",
    outcome: "Machine learning that shows its working",
    card: "Models that learn from your own records and give a clear number, a fair range, and the reasons behind it, inside your app.",
    whatItIs: "We design and build machine learning into an app. The model learns from your own data, gives one clear number, a range around it, and the parts that moved it.",
    examples: [
      "PIRX on pirx.ca: a Projected Time, a Supported Range, and five Structural Drivers for each runner",
      "An estimate a customer can plan around, worked out from their own history",
      "A flag on the records that look off, with the reason",
    ],
    steps: [
      "We pick the one question the number has to answer, and check the data you have.",
      "Simple, safe rules come first, so there is always a sound answer.",
      "Learned models are added when there is enough history, and only used when they beat the rules.",
      "The number, the range and the reasons show up inside the app where people already work.",
    ],
    deliverables: [
      "A model built on your data",
      "A range that widens when the data is thin",
      "The reasons behind each number, in plain words",
      "A fallback to safe rules if a model does worse",
    ],
    who: "Owners with history in their records and a question they ask every day.",
    signs: [
      "You keep asking what happens next, and the spreadsheet can only add up the past",
      "Customers want an estimate and a reason, not just a number",
      "Someone already guesses the answer by hand each week",
    ],
    faqs: [
      ["How much data do we need?", "Enough history to learn from. If it is too thin, we start with simple rules."],
      ["Can we see why a number changed?", "Yes. Each number is split into the parts that moved it."],
    ],
    builtOn: ["Your app", "Your data"],
  },
  {
    slug: "mcp-connectors",
    outcome: "Connect your AI to your tools",
    card: "A safe MCP connector so Claude, ChatGPT and other assistants can use your business tools, with sign-in, permissions and a yes before any change.",
    whatItIs: "MCP, the Model Context Protocol, is an open standard that lets an AI assistant plug into your tools through one common connector. We build that connector for the tools you already use.",
    examples: [
      "Ask your business: plain questions about your CRM, jobs or inventory, read-only to start",
      "Let your AI do the busywork: book, log a call, draft an invoice or update a job, each with a yes first",
      "One safe front door: every AI connection behind one sign-in, with rules and a record",
    ],
    steps: [
      "We list the tools you use, and connect to any that already have a good official connector.",
      "We build the missing connector on Cloudflare, read-only first.",
      "Changes are added one at a time, each asking a person for a yes.",
      "Every action is logged, and each person only reaches what their role allows.",
    ],
    deliverables: [
      "An MCP connector for your tools",
      "Sign-in with your team's own accounts",
      "A yes before any change",
      "A record of every action",
    ],
    who: "Teams already using AI assistants who want them to see and safely use the business's own tools.",
    signs: [
      "Someone copies records into an AI chat to get an answer",
      "Your tools have no official connector, or you use several and want one front door",
      "You want the AI to do routine updates, but only with a person's yes",
    ],
    faqs: [
      ["What is MCP?", "An open standard that lets an AI assistant plug into your tools through one common connector."],
      ["Can the AI change things on its own?", "Only what you allow. Changes ask a person for a yes first."],
    ],
    builtOn: ["Workers", "Durable Objects"],
  },
  {
    slug: "custom-apps",
    outcome: "Custom apps and back offices",
    card: "We build the app around the way you already work, so the real job is the product.",
    whatItIs: "An app built around the way your team already works: the screens, the order, the handoff. It replaces the pile of sheets and inboxes that grew up around that work.",
    examples: [
      "A back office where a request moves from intake to done, in the order your team already uses",
      "A simple screen for the status your customers keep asking about",
      "Replacing a weekly spreadsheet that three people edit and nobody quite trusts",
    ],
    steps: [
      "You walk us through a real Tuesday: who touches the work, in what order, and where it gets stuck.",
      "We build the smallest app that follows that order, and we leave out the features nobody asked for.",
      "It runs on Cloudflare, so the people who need it can open it without a machine in a back room.",
      "You use it on live work. We change the screen where the order was wrong.",
    ],
    deliverables: [
      "The app, deployed, with the roles you named",
      "The records it keeps, in place of the sheet",
      "A short map of who can see what",
      "A way to export the data if you leave",
    ],
    who: "Owners whose real process does not fit a product off the shelf, and who are done bending the team around the software.",
    signs: [
      "The work lives in a spreadsheet, an inbox, and someone's memory",
      "An off-the-shelf tool almost fits, and the gap is where mistakes happen",
      "Two people cannot tell you the same status for the same job",
    ],
    faqs: [
      ["Do we have to change how we work?", "The screen follows the order you already trust. Where that order is the problem, we say so before we build it."],
      ["Can the current staff use it without a training course?", "The first version is the path they already walk. If a screen needs a manual, it is not done."],
      ["Who owns the data?", "You do. We can export it. We do not lock it to a format you cannot leave."],
      ["Is this a rebuild of every tool we use?", "No. We replace the pile that is actually in the way. The tools that already fit can stay."],
    ],
    builtOn: ["Workers", "D1", "R2"],
  },
  {
    slug: "ai-media",
    outcome: "AI media: images, video, transcripts",
    card: "We draft images, video, and voice from material you already have, and a named person clears each file before it goes public.",
    whatItIs: "Pictures, short clips, and transcripts drafted from material the company already has. A named person clears each file before it is public.",
    examples: [
      "A first draft of an image for a page you are about to publish",
      "A transcript of a call or a recording the team needs to read",
      "A short clip cut from footage you already shot, with the words on screen you supply",
    ],
    steps: [
      "You tell us the asset and the rule: what it is for, and what must not appear.",
      "A draft is made on Cloudflare from your prompt or your file.",
      "The named person clears the draft, rejects it, or asks for another pass before anything is public.",
      "The cleared file is stored where the rest of the site or the team can use it.",
    ],
    deliverables: [
      "Drafts of images, transcripts, or short video from your own inputs",
      "A review before anything is published",
      "The finished file, in a format the site or the team can use",
      "A record of which draft was chosen",
    ],
    who: "Owners who need more visuals or transcripts than the team can make by hand, and who still want a person on the publish button.",
    signs: [
      "Pages go out with no picture because nobody had time",
      "Recordings sit unwatched because nobody transcribed them",
      "You want drafts fast and a clear yes before they are public",
    ],
    faqs: [
      ["Will you publish pictures of our customers?", "No, unless you give us that photo and the right to use it. Drafts start from your prompt or your file."],
      ["Are the images ours to use?", "You get the file we made for you, for the use we agreed. We do not resell it."],
      ["Can the text inside an image be trusted?", "Short labels are checked by a person before publish. If a line must be exact, we set it as text on the page rather than hoping the picture spells it."],
      ["Do transcripts replace the recording?", "They are a reading copy. The recording stays the source if the words matter."],
    ],
    builtOn: ["Workers AI", "Images", "Stream"],
  },
  {
    slug: "ai-visibility",
    outcome: "AI visibility and crawler control",
    card: "You decide which pages answer engines may read, and which crawlers stay out.",
    whatItIs: "A clear view of which automated visitors read the site, plus a plain file that tells answer engines what the business is and which pages matter. You decide what is open and what is off limits.",
    examples: [
      "Seeing which crawlers fetched your pages last week",
      "Publishing a short llms.txt that points answer engines at the pages you want quoted",
      "Blocking a crawler that is taking more than you want to give",
    ],
    steps: [
      "We read how the site is already being fetched.",
      "We write the public note, llms.txt, in your words: what you do, and which pages to read.",
      "The controls run on Cloudflare, so a block or an allow applies before the page is served.",
      "You review the note and the blocks before they go live.",
    ],
    deliverables: [
      "A report of crawler traffic you can re-read",
      "An llms.txt, or an update to the one you have",
      "Allow and block rules for the crawlers you name",
      "A note of what we changed",
    ],
    who: "Owners who want answer engines to quote the right pages, and who want a say in what gets copied.",
    signs: [
      "You do not know which bots are reading the site",
      "An answer engine describes you from an old or wrong page",
      "You want a public page quoted, and a private one left alone",
    ],
    faqs: [
      ["Does this guarantee we show up in answers?", "No. It tells crawlers what you want them to read, and it shows you who came. Being quoted still depends on the engine."],
      ["Will a block break search ranking?", "A block aimed at a training crawler is separate from a search crawler. We name which is which before anything is blocked."],
      ["What is llms.txt?", "A plain text file on the site that introduces the business and lists the pages worth reading. People can read it too."],
      ["Do we need new copy?", "Only the description you are willing to stand behind. We do not invent claims for the file."],
    ],
    builtOn: ["AI Crawl Control", "llms.txt"],
  },
  {
    slug: "search-grounded-research",
    outcome: "Search-grounded research tools",
    card: "A research answer carries the public pages under every claim, so you can open the source and check it.",
    whatItIs: "A tool that answers a research question from current pages on the web, and shows the links it used. It is for questions your own documents do not cover.",
    examples: [
      "Checking a public claim against pages published this month",
      "Pulling a short answer before a meeting, with the links underneath",
      "Comparing two public sources side by side instead of trusting one summary",
    ],
    steps: [
      "You ask the question in plain language, and you say what a useful answer includes.",
      "The tool searches the web, reads the pages, and writes the answer with links.",
      "The search runs on Cloudflare. The links stay attached to the sentences they support.",
      "The links that matter can be opened. The answer is a start, not a source.",
    ],
    deliverables: [
      "A research tool the team can ask",
      "Answers with the links beside the claims",
      "A way to save an answer worth keeping",
      "A reminder, on the page, that the links are the source",
    ],
    who: "Owners who need a current answer from the public web and do not want an unsourced paragraph.",
    signs: [
      "Someone spends an hour opening tabs before a decision",
      "A pasted summary has no link, and nobody can tell if it is current",
      "Your own files do not cover the question, because the facts live outside the company",
    ],
    faqs: [
      ["How is this different from asking a chatbot?", "The answer has to point at pages. If it cannot find a page, it says so."],
      ["Can it read pages behind a login?", "No. It reads public pages. Private files belong in the document search, not here."],
      ["Will it cite a page it did not open?", "No. Every claim you are meant to trust carries a link, and you can open it."],
      ["Is the answer advice?", "It is a reading list with a summary. The decision stays with the company."],
    ],
    builtOn: ["Web Search API"],
  },
];

export const OFFERINGS_KICKER = "Custom software";
export const OFFERINGS_HEADING = "Everything you need to put AI to work.";

/**
 * One grouping for the homepage cards, the services hub, the nav, and the footer.
 * Design has no service URL. It points at live portfolio work.
 */
export const businessFunctions = [
  {
    id: "search",
    name: "Search & AI visibility",
    promise: "Show up when someone asks a search engine or an AI assistant for what you do.",
    services: ["ai-visibility"],
  },
  {
    id: "marketing",
    name: "Marketing",
    promise: "Ship on-brand images, video, and voice, and research you can open and check.",
    services: ["ai-media", "search-grounded-research"],
  },
  {
    id: "sales",
    name: "Sales",
    promise: "An assistant that keeps the conversation and finishes the request in the tools you already use.",
    services: ["ai-assistants-and-agents"],
  },
  {
    id: "service",
    name: "Customer service",
    promise: "Callers get an answer from your records, and a person when the call needs one.",
    services: ["voice-and-realtime-agents"],
  },
  {
    id: "operations",
    name: "Operations",
    promise: "Turn the way you already work into software, answers from your files, and web jobs that run themselves.",
    services: ["web-automation", "answers-from-your-documents", "custom-apps", "machine-learning"],
  },
  {
    id: "design",
    name: "Design",
    promise: "Websites and product pages built to sell, live today for StrongFoam, Milrcorr and pirx.ca.",
    services: [],
    work: [
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam" },
      { href: "/portfolio/milrcorr/", label: "Milrcorr" },
      { href: "/portfolio/pirx/", label: "pirx.ca" },
    ],
  },
  {
    id: "platform",
    name: "Platform",
    promise: "Use the best model for every job, on one bill, and let AI do real work, safely.",
    services: ["any-model-one-bill", "safe-code-execution", "mcp-connectors"],
  },
];

/** Cloudflare AI Gateway providers, checked against the Provider Native docs. */
export const gatewayLogos = [
  { name: "Workers AI", file: "workers-ai.svg" },
  { name: "Amazon Bedrock", file: "amazon-bedrock.svg" },
  { name: "Anthropic", file: "anthropic.svg" },
  { name: "Azure OpenAI", file: "azure-openai.svg" },
  { name: "Baseten", file: "baseten.svg" },
  { name: "Cartesia", file: "cartesia.svg" },
  { name: "Cerebras", file: "cerebras.svg" },
  { name: "Cohere", file: "cohere.svg" },
  { name: "Deepgram", file: "deepgram.svg" },
  { name: "DeepSeek", file: "deepseek.svg" },
  { name: "ElevenLabs", file: "elevenlabs.svg" },
  { name: "Fal AI", file: "fal.svg" },
  { name: "Google AI Studio", file: "google-ai-studio.svg" },
  { name: "Google Vertex AI", file: "google-vertex-ai.svg" },
  { name: "Groq", file: "groq.svg" },
  { name: "Hugging Face", file: "hugging-face.svg" },
  { name: "Ideogram", file: "ideogram.svg" },
  { name: "Mistral AI", file: "mistral.svg" },
  { name: "OpenAI", file: "openai.svg" },
  { name: "OpenRouter", file: "openrouter.svg" },
  { name: "Parallel", file: "parallel.svg" },
  { name: "Perplexity", file: "perplexity.svg" },
  { name: "Replicate", file: "replicate.svg" },
  { name: "xAI", file: "xai.svg" },
];

/** Workers AI model families. gpt-oss and Whisper reuse the OpenAI mark, with the name beside it. */
export const familyLogos = [
  { name: "Meta Llama", file: "meta-llama.svg" },
  { name: "Google Gemma", file: "gemma.svg" },
  { name: "Mistral", file: "mistral.svg" },
  { name: "Qwen", file: "qwen.svg" },
  { name: "DeepSeek", file: "deepseek.svg" },
  { name: "gpt-oss", file: "gpt-oss.svg" },
  { name: "NVIDIA Nemotron", file: "nvidia-nemotron.svg" },
  { name: "Moonshot Kimi", file: "moonshot-kimi.svg" },
  { name: "Zhipu GLM", file: "zhipu.svg" },
  { name: "IBM Granite", file: "ibm-granite.svg" },
  { name: "Black Forest Labs FLUX", file: "flux.svg" },
  { name: "Stability", file: "stability.svg" },
  { name: "Leonardo", file: "leonardo.png" },
  { name: "Whisper", file: "whisper.svg" },
  { name: "BAAI", file: "baai.svg" },
];

export const cases = [
  {
    slug: "schema",
    name: "Schema",
    kind: "product",
    sameAs: "https://schema-two.vercel.app/",
    image: "/assets/schema-home.webp",
    imageAlt: "Schema home page: a URL field and an AI visibility check.",
    summary: "See how easily AI search can find your site, and get the fixes to improve it.",
    body: [
      "Schema scores how visible a site is to answer engines and generates the repair.",
    ],
  },
  {
    slug: "llm-leverage",
    name: "LLM Leverage",
    kind: "course",
    sameAs: "https://learn.abra-ca-dabra.app",
    image: "/assets/llmcourse-home.webp",
    imageAlt: "LLM Leverage course home: a lesson preview and a rollout path.",
    summary: "A self-paced course for better answers from any model, plus a workshop path.",
    body: [
      "LLM Leverage is a self-paced course for better answers from any model, plus a workshop path for a rollout.",
      "Twelve modules, each with a quiz you pass at 75%.",
    ],
  },
  {
    slug: "super-funnel",
    name: "Super Funnel",
    kind: "product",
    sameAs: "https://abra-ca-dabra.app/films.html",
    image: "/assets/superfunnel-getting-started.webp",
    imageAlt: "Super Funnel Getting started film poster.",
    summary: "A sales app for associates, shown in a 66-second tour.",
    body: [
      "Super Funnel is one associate app, shown as a film rather than a separate public URL.",
      "The homepage carries the Getting started film: the home dashboard, setup, pipeline, and nav, in 66 seconds. The other seven tours are on the films page.",
    ],
  },
  {
    slug: "pirx",
    name: "pirx.ca",
    kind: "proof",
    proofFigures: [
      { value: "398K", label: "search impressions" },
      { value: "46.5K", label: "AI-feature impressions" },
    ],
    proofCaption: "pirx.ca, Jul 18 to Oct 17, 2026",
    sameAs: "https://pirx.ca/",
    image: pirxHero.desktop.src,
    imageAlt: pirxHero.desktop.alt,
    cardImage: pirxHero.desktop,
    hero: pirxHero,
    shots: pirxCaseShots,
    summary: "We designed and built the PIRX app, its machine learning, and the blogs. From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days, Jul 18 to Oct 17, 2026.",
    chart: true,
    services: ["machine-learning", "custom-apps", "ai-visibility", "search-grounded-research"],
    body: [
      "pirx.ca is the PIRX app, its machine learning, and the blogs. We designed and built all three.",
      "The app is the product people use. The blogs are the public pages behind the search record below.",
      "From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days.",
      "Google Search Console, Jul 18 to Oct 17, 2026, recorded 398K search impressions, 1.94K clicks, and an average position of 7.6. The count starts near zero in mid-July.",
      "The Generative AI features report is a separate number and is not added to the search total. It recorded 46.5K impressions in the same window. The top pages are the blog guides: Good 10K time by age (11,068), Good half marathon time by age (8,192), and Good 5K time by age (6,728).",
      "Both curves start near zero in mid-July, step up around Aug 31, and reach daily peaks of about 12-18K in search and about 1.2-1.8K in AI features by mid-September. The chart shows that shape. Results vary by site; these are pirx.ca's own numbers.",
    ],
  },
  {
    slug: "superpatch-products",
    name: "SuperPatch products",
    kind: "work",
    summary: "Public product pages: the offer, the comparison, and the questions a buyer asks.",
    services: ["ai-assistants-and-agents", "custom-apps"],
    body: [
      "SuperPatch products are the public product pages: the offer, the comparison, and the questions a buyer asks before they decide.",
    ],
  },
  {
    slug: "milrcorr",
    name: "Milrcorr",
    kind: "site",
    sameAs: "https://milrcorr.com",
    loop: { base: "/assets/video/milrcorr-loop", label: "Milrcorr website" },
    summary: "The public site for StrongFoam's sister commercial fit-out work. A visitor can see the work and request an estimate.",
    services: ["custom-apps", "web-automation"],
    body: [
      "Milrcorr is the public site for StrongFoam's sister commercial fit-out work.",
      "A visitor can see office, retail, and hospitality fit-outs across Southwestern Ontario, and request an estimate.",
      "Project photos on the site show finished reception rooms and glass-walled offices.",
    ],
  },
  {
    slug: "strongfoam-website",
    name: "StrongFoam website",
    kind: "site",
    sameAs: "https://strongfoam.com/",
    loop: { base: "/assets/video/strongfoam-loop", label: "StrongFoam website" },
    summary: "A public site where a visitor can start an estimate and book, so the request stays with the page.",
    services: ["custom-apps", "web-automation"],
    body: [
      "The StrongFoam website walks through the offer, an estimate a visitor can start, and a booking.",
      "Visitors can get an estimate and book without picking up the phone.",
    ],
  },
  {
    slug: "strongfoam-crm",
    name: "StrongFoam CRM/ERP",
    kind: "app",
    image: "/assets/strongfoam-erp-demo.webp",
    imageAlt: "StrongFoam CRM/ERP film poster: lead, spray, closeout.",
    film: {
      src: "/assets/films/strongfoam-erp-demo.mp4",
      poster: "/assets/films/thumbs/strongfoam-erp-demo.jpg",
      label: "StrongFoam CRM/ERP: lead to closeout",
    },
    summary: "The record you work in: the customer, the job, and the numbers, in one place.",
    services: ["custom-apps"],
    body: [
      "One place for customers, jobs and numbers, built around how StrongFoam works.",
      "The customer, the job, and the numbers live in one place.",
      "The film follows one job in about three minutes: an inbound email becomes an estimate with cited suggestions, then a schedule and a job. Field crews add voice notes and photo captions, and the closeout ends in a daily digest.",
    ],
  },
  {
    slug: "renew-implants",
    name: "Renew Implants",
    kind: "site",
    summary: "The website, the social posts, and the blogs.",
    services: ["custom-apps", "ai-media", "ai-visibility"],
    body: [
      "Renew Implants is the website, the social posts, and the blogs, as one public presence.",
      "The site says what the work is, and the posts and the blogs are what a person can read before they enquire.",
    ],
  },
];

export const products = [
  {
    slug: "schema",
    name: "Schema",
    sameAs: "https://schema-two.vercel.app/",
    image: "/assets/schema-home.webp",
    imageAlt: "Schema home page: a URL field and an AI visibility check.",
    description: "See how easily AI search can find your site, and get the fixes to improve it.",
    caseSlug: "schema",
  },
  {
    slug: "super-funnel",
    name: "Super Funnel",
    sameAs: "https://abra-ca-dabra.app/films.html",
    image: "/assets/superfunnel-getting-started.webp",
    imageAlt: "Super Funnel Getting started film poster.",
    description: "A sales app for associates, shown in a 66-second tour of the dashboard, setup and pipeline.",
    caseSlug: "super-funnel",
  },
];

export const course = {
  slug: "llm-leverage",
  name: "LLM Leverage",
  sameAs: "https://learn.abra-ca-dabra.app",
  image: "/assets/llmcourse-home.webp",
  imageAlt: "LLM Leverage course home: a lesson preview and a rollout path.",
  description: "A self-paced course for better answers from any model, with a workshop path beside it. Twelve modules, each with a quiz you pass at 75%.",
};

export const PLACEHOLDER = "PLACEHOLDER — needs owner sign-off";

export const placeholders = {
  offering: "Price, timeline, and a client example for this service are not on the site yet.",
  portfolio: "Want something like this for your business?",
  product: "Pricing on request. Start a project to talk it through.",
  course: "Open the course to see every module, or start a project to bring it to your staff.",
};
