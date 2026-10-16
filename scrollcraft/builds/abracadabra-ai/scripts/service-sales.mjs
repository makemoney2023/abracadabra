/** Sales copy for /services/. Industry nouns stay off these pages. Named proof is only work Christopher cleared. */

import { pirxCustomAppShots, pirxVisibilityShots } from "./pirx-shots.mjs";

export const READINESS_URL = "https://check.abra-ca-dabra.app/check";

export const processIntro = "From first conversation to a system that runs itself.";

export const processSteps = [
  {
    title: "Plan",
    text: "We map how the work gets done today, including the calls only a person should make, and agree on it before anything is built.",
  },
  {
    title: "Build",
    text: "Built on Cloudflare and connected to the tools you already use, so nothing has to move.",
  },
  {
    title: "Review",
    text: "Tested on your real work from last week before any customer sees it.",
  },
  {
    title: "Launch and run",
    text: "We launch with close monitoring, keep it running, and you can change the rules at any time. It's yours to keep.",
  },
];

function page(entry) {
  return entry;
}

export const salesPages = {
  "ai-assistants-and-agents": page({
    short: "AI assistants",
    title: "AI assistants that actually get things done",
    headline: "AI assistants that actually get things done.",
    description: "Your assistant keeps the conversation, follows your rules, and finishes the request in the tools you already use.",
    dek: "Answer customers instantly, book and follow up in the tools you already use, and hand off to your staff with the full conversation when it matters.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/services/safe-code-execution/", label: "Safe code execution" },
    ],
    problemTitle: "Great answers. Then nothing happens.",
    problem: [
      "Customers ask the same questions every day, often after you have moved on to something else. Each new message arrives without the history of who they are, what they asked, and which rule applies. You send a familiar paragraph, and the booking or the follow-up still has to happen in another system.",
      "Most chatbots can talk but can't do anything. Yours knows each customer, follows your rules, finishes the request, and brings in your staff when it should.",
    ],
    outcomes: [
      { title: "Remembers every customer", text: "Each reply picks up where the last one left off, and every customer's history stays private." },
      { title: "Requests that get done", text: "Bookings, status checks and callbacks are completed in the tools you already use." },
      { title: "A handoff with the context", text: "When the question sits outside your rules, a person receives the thread and the facts already gathered." },
      { title: "A clear record", text: "See what was done, why, and when a person took over." },
    ],
    uses: [
      { title: "After-hours questions", text: "The assistant answers the questions you have already written down. Everything else waits until morning, with the thread attached." },
      { title: "Status on an open request", text: "Customers get an instant update on their order or job without you digging through your inbox." },
      { title: "A routine request, completed", text: "A booking, a callback, or a form is completed in the system you already use. The customer is not asked to start the request again." },
    ],
    capability: {
      title: "A small program, run safely",
      text: "When a task needs a calculation or a file check, the assistant runs it in a locked-down space with strict limits.",
      href: "/services/safe-code-execution/",
      label: "See how safe code works",
    },
    compareIntro: "Three ways to handle customer questions, and what each one actually gets done.",
    rows: [
      { label: "What it knows", shelf: "A general model, plus whatever help text was pasted in.", hire: "Whatever the new person has learned so far.", us: "Your rules and the records that are connected, and nothing else." },
      { label: "What it may do", shelf: "It can talk. Completing the request stays with a person.", hire: "The whole job, at the speed of one person.", us: "Only the actions on the list. Everything else is a handoff." },
      { label: "Who keeps it honest", shelf: "The vendor's roadmap and the pasted text.", hire: "A salary, and a handover when that person leaves.", us: "You hold the rules, and a customer-facing step is checked against last week's work." },
      { label: "When you don't need us", shelf: "If your questions fit on one page and nothing needs to get done afterward, an off-the-shelf chatbot is enough.", hire: "A hire does not make a generic chat window better. Staffing a job a finished product already does is the wrong purchase.", us: "Our advice: buy the product." },
    ],
    proofs: [
      {
        title: "SuperPatch products",
        text: "SuperPatch products are public pages a buyer can read: the offer, the comparison, and the questions. The assistant sits beside that record, so a reply can follow the product already published.",
        href: "/portfolio/superpatch-products/",
        link: "Read the SuperPatch products note",
      },
    ],
    faqs: [
      ["Will it invent an answer?", "It answers from the rules and the records you give it. When those do not cover the question, it says so and hands the conversation to a person."],
      ["Can it take actions, or only chat?", "Both, within the jobs on the list. A booking or a status update is an action. Anything outside that list waits for a person."],
      ["Does it remember an earlier conversation?", "Yes, for the customer or the thread that is connected. A new person does not see someone else's history."],
      ["What has to be maintained?", "The rules and the facts. When a policy or a price changes, you update that source, and the assistant follows the new version."],
      ["Can it email a customer on its own?", "Only for the messages on the list, and only after you have reviewed that step. It never sends a message you haven't approved."],
      ["What does it cost?", "Priced to the project. Tell us what you need and we'll quote it."],
    ],
    close: "Show us one request you handle every week, and we'll show you how the assistant would take it off your plate.",
  }),
  "answers-from-your-documents": page({
    short: "Answers from your documents",
    title: "Instant answers from your own documents",
    headline: "Instant answers from your own documents.",
    description: "Ask in plain language. We answer from your files, and every answer carries the page it came from.",
    dek: "Ask a question in plain words and get the answer from your own handbooks, policies and price sheets, with a link to the exact page.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "The answer's already written down. Now you can find it.",
    problem: [
      "The policy, the price, or the clause is already written. Reaching it means opening the wrong folder, asking the person who wrote it, or trusting a paragraph someone pasted into chat last month. The file and the answer drift apart, and two people give two versions of the same rule.",
      "Search across a shared drive returns files, not the sentence. A general model returns a fluent paragraph that may not be your rule at all. You should not have to remember which folder holds the current rule. You get the current answer, the page it came from, and an honest 'not in your files' when it isn't there.",
    ],
    outcomes: [
      { title: "A plain question", text: "You or a customer ask the way you already talk. The file name is not required." },
      { title: "The page, attached", text: "The answer points at the page it came from, so you can open the sentence and read it." },
      { title: "The current file", text: "Update a policy and answers update with it." },
      { title: "An honest 'I don't know'", text: "If your documents do not contain the answer, we say so. We do not fill the gap with a general guess." },
    ],
    uses: [
      { title: "A policy lookup", text: "Someone asks what the rule is. The answer quotes the policy on file and links the page." },
      { title: "A part, a price, or a clause", text: "The question is specific. The reply comes from the sheet or the contract you already trust, with the line it used." },
      { title: "A staff question that should not wait", text: "Staff get answers right away, without interrupting you." },
    ],
    compareIntro: "A shared drive, a person who knows the files, and a system that answers from them are not the same purchase.",
    rows: [
      { label: "What comes back", shelf: "A list of files that might match the words.", hire: "The paragraph, once someone has time.", us: "The answer, with the page it came from." },
      { label: "Which version", shelf: "Whichever file the search ranks, including the old one.", hire: "Whichever copy that person trusts.", us: "The file you marked current." },
      { label: "When it should refuse", shelf: "It still offers a closest match.", hire: "The answer may come from memory.", us: "It says your files do not contain it." },
      { label: "When you don't need us", shelf: "A handful of files, one person who knows them, and you can wait. A folder with a careful name is enough. Buy nothing custom.", hire: "With only a few files, a well-organized folder does the job.", us: "Our advice: keep the folder. Document search earns its place when the files are many and the same question keeps arriving." },
    ],
    proofs: [
      {
        title: "No named case on this page yet",
        text: "This service does not yet have its own named public case. We will not borrow a name to fill the gap. The portfolio lists the systems that can be named, including records you already work in.",
        href: "/portfolio/",
        link: "See the portfolio",
      },
    ],
    faqs: [
      ["Will it answer from the public internet?", "No. This service reads the files you give it. Questions that live on the public web belong in search-grounded research, and the two stay apart."],
      ["What if two files disagree?", "You pick which file is current. Until then, the answer shows both pages and does not pretend they say the same thing."],
      ["Can customers see internal files?", "Only the set you mark for them. A staff handbook and a customer policy are different collections, and the question is asked against one of them."],
      ["Does it work on a scan?", "If the scan has text that can be read, yes. If a scan can't be read, it tells you instead of guessing."],
      ["Who decides which file is current?", "You do. The system follows that mark. You decide which version is current, and answers follow it."],
      ["What does it cost?", "Priced to the project, based on your files and how they're used. Tell us what you need and we'll quote it."],
    ],
    close: "Bring a question you answer every week, and we'll show you the answer coming straight from your files.",
  }),
  "any-model-one-bill": page({
    short: "Any model, one bill",
    title: "Every AI model. One bill",
    headline: "Every AI model. One bill.",
    description: "Each job uses the model that fits it. You get one gateway and one bill you can cap and stop.",
    dek: "Use the best AI for every job, on one account and one bill, and switch any model off in a click.",
    strip: [
      { href: "/#models", label: "The models on this site" },
    ],
    problemTitle: "More AI tools shouldn't mean more accounts and invoices.",
    problem: [
      "Every new AI tool brings another login and another invoice, and only one person knows how it all fits together.",
      "We connect every model in one place, so each task uses the right one and everything lands on a single bill.",
    ],
    outcomes: [
      { title: "One account for every model", text: "The models you use are called through one place. Adding one does not mean a new vendor login for everyone." },
      { title: "The model matches the job", text: "A short draft, a careful answer, and an image do not have to share a single model. You can change the choice." },
      { title: "A bill you can stop", text: "Usage sits on one bill. If a model is not earning its place, you turn it off without unwiring the rest of the work." },
      { title: "No invented spend story", text: "We do not publish anyone's invoice here. The proof is the gateway itself, and the providers named on the homepage." },
    ],
    uses: [
      { title: "A draft, then a check", text: "A fast model writes the first pass. A second model, or a person, checks the claims." },
      { title: "An image or a transcript beside the text", text: "The job needs a different provider than the one that writes paragraphs. It still lands in the same system and on the same bill." },
      { title: "Turning a model off", text: "A provider changes price or quality. You stop sending that model work. The jobs that remain keep running on the models you left in place." },
    ],
    compareIntro: "One vendor account, a person who manages keys, and a gateway are different amounts of work.",
    rows: [
      { label: "How a model is added", shelf: "A new account, a new key, a new invoice.", hire: "Someone on staff learns that vendor and keeps the key safe.", us: "You add it on the gateway you already have." },
      { label: "How the cost is read", shelf: "One vendor at a time, in that vendor's words.", hire: "A spreadsheet, if someone maintains it.", us: "One bill, with the model named on the usage." },
      { label: "How it stops", shelf: "Close that account and rewire what used it.", hire: "The knowledge leaves with the person.", us: "You turn the model off. The other jobs stay." },
      { label: "When you don't need us", shelf: "One model, a bill that is already clear, and no plan to switch. Stay. A gateway you do not need is another thing to watch.", hire: "A hire to manage a single key is overhead.", us: "Our advice: stay on the one vendor. The gateway earns its place when the second model shows up." },
    ],
    proofs: [
      {
        title: "The model list on this site",
        text: "The homepage names the gateway providers and the model families in two rows you can read. That list is the proof for this service. We do not attach anyone's spend, and we do not imply a seat purchase.",
        href: "/#models",
        link: "See the models",
      },
    ],
    faqs: [
      ["Does every model on the list have to be used?", "No. The list is what can be routed. You choose which models your business may call. The others stay off."],
      ["Is this a discount on model prices?", "No. You pay for what you use, all on one bill."],
      ["Where do the prompts and files go?", "Everything runs securely on Cloudflare, and your data goes only to the model doing the work."],
      ["Can a model you already pay for stay?", "If it is on the gateway, yes. A working account does not have to be thrown away to start."],
      ["What if a provider has an outage?", "The job can fall back to another model already on the list, or it can wait. You write that choice down. A model you never allowed is not swapped in quietly."],
      ["Who holds the keys?", "Access is managed centrally, so nothing breaks when someone leaves."],
    ],
    close: "Tell us which AI tools you use today, and we'll show you how they fit on one bill.",
  }),
  "voice-and-realtime-agents": page({
    short: "Voice",
    title: "AI that answers your phone",
    headline: "AI that answers your phone.",
    description: "Callers hear an answer from your records. When the call needs a person, we hand it over with a note of what was already said.",
    dek: "Answer every call, day or night, with accurate answers from your own records, and transfer to your staff with a quick summary when needed.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "Every caller gets an answer, even when you're busy.",
    problem: [
      "Callers ask for a fact that is already written down, then wait because the person who can read the file is on another line. The message that follows asks them to repeat the details. The next morning someone enters those details into the same record the line could have read.",
      "It never makes things up. It says what your records say, and hands off when a person is needed.",
    ],
    outcomes: [
      { title: "An answer from the record", text: "The line says what your record says. It does not fill a silence with a plausible sentence." },
      { title: "Smooth handoffs", text: "Calls go to your staff with a short summary, so nobody repeats themselves." },
      { title: "Books and confirms", text: "It takes bookings and messages, and only does what you've allowed." },
      { title: "A recording of the run", text: "You can replay the call and the note. Replay any call to see exactly what was said." },
    ],
    uses: [
      { title: "A question you already answer", text: "Hours, status, what to bring, where to send a file. The line reads the source on file and says that, then offers a person if the caller needs more." },
      { title: "A booking or a callback", text: "The caller asks for a time or a return call. The request lands in the system you already use, without a second telling of the same details." },
      { title: "After you are closed", text: "The line stays up. It answers the closed-hours list and takes the rest as a message you see in the morning, with the call attached." },
    ],
    compareIntro: "A phone tree, a person on the line, and a voice system that reads the record fail in different ways.",
    rows: [
      { label: "What the caller hears", shelf: "A menu, then a voicemail.", hire: "A person, when someone is free.", us: "The fact from your record, or a person with the note." },
      { label: "When it does not know", shelf: "It still routes, or it hangs up.", hire: "They look it up, or they guess.", us: "It says so and hands the call over." },
      { label: "What gets written down", shelf: "A voicemail, if anyone listens.", hire: "Whatever that person types later.", us: "The request, in the system you already use." },
      { label: "When you don't need us", shelf: "If you get a few calls a day and handle them well, keep doing that.", hire: "A hire is right when the calls need judgment all the way through and the record would not shorten them.", us: "Our advice: keep the person on a quiet line. The voice system earns its place when the same facts are repeated and the exceptions still need a person." },
    ],
    proofs: [
      {
        title: "No named voice case on this page",
        text: "This service does not yet have its own named public case. We will not borrow a name to fill the gap. The portfolio lists the systems that can be named.",
        href: "/portfolio/",
        link: "See the portfolio",
      },
    ],
    faqs: [
      ["Will it sound like a person on staff?", "It sounds like the voice you choose, and it says only what the record supports. A named staff member is not imitated."],
      ["Can it transfer to a real phone?", "Yes, to the number you set, with a short note of the call so far. If nobody picks up, it takes a message."],
      ["What about a noisy line or a strong accent?", "If it did not hear the question, it asks again. It does not guess a name or a number it did not catch."],
      ["Are calls stored?", "The calls you choose to keep, for the reason you write down. You can turn retention off. Recordings are yours, and you can turn them off."],
      ["Can it take a payment on the call?", "Only if that action is on the list and the payment path is one you already use. Otherwise it books a person."],
      ["Does this replace the people on the phone?", "It takes the calls on the list. The calls that need judgment still go to a person. If the volume does not justify that split, the recommendation is to leave the line alone."],
    ],
    close: "Tell us about a call from last week that could have been answered automatically, and we'll show you how.",
  }),
  "web-automation": page({
    short: "Web automation",
    title: "Put repetitive web work on autopilot",
    headline: "Put repetitive web work on autopilot.",
    description: "The weekly browser job opens the same pages, collects the same numbers, and leaves a report you can open.",
    dek: "Hand off the repetitive clicking, form-filling and copying between websites. It runs the same way every time and flags anything unusual for you.",
    strip: [
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
    ],
    problemTitle: "Stop doing the same web tasks by hand.",
    problem: [
      "Downloading reports, filling in forms and copying data between sites takes hours, and one skipped step can throw off your numbers.",
      "A macro on one laptop breaks when a site changes. We set it up to run reliably and show you exactly what happened.",
    ],
    outcomes: [
      { title: "The same steps", text: "Every run follows the same steps, and nothing gets silently skipped." },
      { title: "Exceptions in a queue", text: "A page that does not match, a login that fails, a total that looks wrong: a person receives that run. The rest continue." },
      { title: "A log you can open", text: "Each run says what it opened, what it wrote, and where it stopped." },
      { title: "Lands in the right place", text: "Data goes straight where it belongs." },
    ],
    uses: [
      { title: "A weekly file into a report", text: "The same export arrives every week. The run places it in the report you already read, and it stops if a column is missing." },
      { title: "A form that should arrive once", text: "A request already captured on a page is entered into the system of record. The visitor is not asked to send it again by email." },
      { title: "A check against a public page", text: "A status, a price, or a listing you are allowed to read is compared with the copy on file. A mismatch is raised. A match is left alone." },
    ],
    compareIntro: "Three ways to handle repetitive web work.",
    rows: [
      { label: "When the page moves", shelf: "The plugin breaks on that laptop.", hire: "The person notices, or they do not.", us: "The run stops and the log says which step failed." },
      { label: "Who can see it", shelf: "Whoever sits at that computer.", hire: "The person, plus whoever they told.", us: "The log, for the people you grant access." },
      { label: "What happens to the odd one", shelf: "It is skipped, or it is entered wrong.", hire: "They handle it if they notice.", us: "It waits for a person. The clear runs finish." },
      { label: "When you don't need us", shelf: "The task happens once a month, the page is stable, and a person can spare the ten minutes. A reminder and a checklist are enough. A site that changes every week is a moving target and should stay with a person.", hire: "A hire to click a stable monthly form is a poor use of a person. A hire to handle the exceptions is still right.", us: "A path that keeps changing stays with a person. It's worth it when the same task comes up often." },
    ],
    proofs: [
      {
        title: "StrongFoam website",
        text: "The StrongFoam website takes the request on the page: a visitor can start an estimate and book, so the details stay with the request. That is the public shape of this service. Figures and quotes stay off this page.",
        href: "/portfolio/strongfoam-website/",
        link: "Read the StrongFoam website note",
      },
    ],
    faqs: [
      ["Will it log in as one of your staff?", "It uses an account created for the job, with only the access that job needs. It does not use a person's password."],
      ["What if the site shows a captcha or a surprise prompt?", "The run stops and a person receives it. A control the site put there to block automation is not bypassed."],
      ["Can it click through a site you do not own?", "Only where you have the right to act, with an account you control or a page that is public. A system you are not allowed to use this way is left alone."],
      ["How does a step change?", "We rewrite the path and you try it on last week's file before it replaces the old path."],
      ["What if it writes the wrong value?", "The log shows the value and the field. The runs on the list can be reversed. A write that is hard to undo waits for a person."],
      ["Is this a bot that browses the web all day?", "No. It only runs the tasks you set, on your schedule."],
    ],
    close: "Tell us about a web task someone did by hand this week, and we'll show you how to automate it.",
  }),
  "safe-code-execution": page({
    short: "Safe code execution",
    title: "Let AI run code, safely",
    headline: "Let AI run code, safely.",
    description: "When your assistant needs to run a small program, it runs inside a sandbox. Time, files, and access are set before it starts.",
    dek: "Let your AI assistant run calculations, check files and fill templates, inside strict limits you set.",
    lead: {
      before: "Included with",
      href: "/services/ai-assistants-and-agents/",
      label: "AI assistants and agents",
      after: ".",
    },
    strip: [
      { href: "/services/ai-assistants-and-agents/", label: "AI assistants" },
    ],
    problemTitle: "When a reply isn't enough, your assistant can do the work.",
    problem: [
      "Copying numbers out of a chat to run them by hand is slow. Giving AI free rein is risky.",
      "We give it one job, specific files and a time limit. If it hits a limit, it stops and tells you.",
    ],
    outcomes: [
      { title: "A task, not a blank console", text: "The job is specific: this calculation, this check, this draft. A request to do something else is refused." },
      { title: "Bounds you can point at", text: "Time, memory, and which files it may read or write are set before it runs. Those bounds are part of the plan." },
      { title: "A result you can read", text: "The output comes back to the assistant with what it used. You can run it again or throw it out." },
      { title: "Stops safely", text: "If anything looks off, it stops and explains why." },
    ],
    uses: [
      { title: "A calculation from rows you trust", text: "The assistant takes numbers already in the file and returns the total the rule describes." },
      { title: "A check before something is sent", text: "A file is tested against the rule you wrote: required fields, a total that matches, a name that exists. Failures go to a person with the reason." },
      { title: "A draft from a template", text: "The task fills a template already on the list. It does not invent a new template, and it does not send the result. Sending stays a separate step." },
    ],
    compareIntro: "Letting a model loose on a laptop, hiring someone to run the sheet, and a fenced task are different risks.",
    rows: [
      { label: "What it can touch", shelf: "Whatever the plugin or the laptop can touch.", hire: "Whatever that person can open.", us: "The files and the actions on the list, for the time that was set." },
      { label: "When it fails", shelf: "The miss may show up later.", hire: "They notice if they are looking.", us: "The run stops and the reason is in the log." },
      { label: "Who sends the result", shelf: "Sometimes the tool does, if the toggle was on.", hire: "The person, when they are trusted to.", us: "A person, unless sending is explicitly on the list." },
      { label: "When you don't need us", shelf: "The assistant only needs to talk, or the task is one formula in a sheet a person already opens. A code runner does not belong behind a conversation that never needed one.", hire: "A person running a weekly sheet by hand is fine when the sheet is small and the cost of a miss is low.", us: "This stays out of the assistant when the job is conversation only. The sandbox earns its place when a task is repeated and a wrong write would be expensive." },
    ],
    proofs: [
      {
        title: "It ships inside the assistant",
        text: "It's part of every AI assistant we build. See the assistant page.",
        href: "/services/ai-assistants-and-agents/",
        link: "Read the assistant page",
      },
    ],
    faqs: [
      ["Is this a server to rent and forget?", "No. It is a task the assistant runs, inside a sandbox, on Cloudflare. An open machine and a password are not part of the delivery."],
      ["Can it download anything it wants?", "No. It only uses tools you've approved."],
      ["Can it reach production records?", "It only sees the data you allow, nothing more."],
      ["What if the model writes bad code?", "The task still runs inside the sandbox, and the result is not sent until the review you set. A crash is a log line, not a change to the record."],
      ["Do you have to read the code?", "You read the task in plain language: what it may open, what it may write, and when it must stop. We maintain the code."],
      ["Can this be bought without an assistant?", "It comes as part of an AI assistant."],
    ],
    close: "Tell us about a task you still do by hand after a chat, and we'll show you how your assistant could do it safely.",
  }),
  "custom-apps": page({
    short: "Custom apps",
    title: "Apps built around your workflow",
    headline: "Apps built around your workflow.",
    description: "We build the app around the way you already work, so the real job is the product.",
    dek: "Off-the-shelf tools make you work their way. We build software that works your way, with your customers, jobs and numbers in one place.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
      { href: "/portfolio/strongfoam-crm/", label: "StrongFoam CRM/ERP" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
      { href: "/portfolio/pirx/", label: "pirx.ca" },
    ],
    problemTitle: "Software that fits how you actually work.",
    problem: [
      "When your software doesn't fit, people fall back on spreadsheets, and nobody's sure which version is right.",
      "Another subscription adds a login. A developer adds a waiting list. Usually you only need one well-built piece: the estimate, the booking, the record you trust, or the page a buyer reads before they ask.",
    ],
    outcomes: [
      { title: "A screen in the real order", text: "The first thing you do in the morning is the first thing on the screen. Fields nobody uses are not there." },
      { title: "One record", text: "Customers, jobs and numbers in one place, with no extra spreadsheets." },
      { title: "A public page when the job needs one", text: "If a buyer or a caller has to understand the offer before they talk to you, that page is part of the application, not a separate project that drifts." },
      { title: "A record you can leave with", text: "Your data is always yours to export." },
    ],
    uses: [
      { title: "The record you work in", text: "Customers, jobs, and the numbers, in the order the day actually happens. No more end-of-week clean-up between two systems." },
      { title: "A request that becomes work", text: "An estimate, a booking, or a form on the public site lands in the record. It does not have to be entered again to become real." },
      { title: "A page a buyer can finish", text: "The offer, the comparison, and the questions are on the page. The buyer arrives having read them, and you are not repeating the same explanation." },
    ],
    compareIntro: "A rented suite, a developer on staff, and an application built around one job solve different problems.",
    rows: [
      { label: "Fit", shelf: "The product's order. You adapt.", hire: "Whatever the person has time to finish.", us: "The way you already work, settled before the build." },
      { label: "What stays in your hands", shelf: "The vendor's updates, and the side record.", hire: "The person, the code, and the handover.", us: "You own it. Built on Cloudflare." },
      { label: "When it is wrong", shelf: "You wait on a roadmap, or you work around it.", hire: "You wait on one person's queue.", us: "The screen changes, and you try it on last week's work." },
      { label: "When you don't need us", shelf: "If a spreadsheet already does the job well, keep it. The same goes for a rented app people actually use.", hire: "A full-time hire makes sense when there is a continuous stream of product changes and someone to manage them. One screen is not that job.", us: "Our advice: keep the sheet or the suite. The build starts when the side system has become the real one." },
    ],
    proofs: [
      {
        title: "SuperPatch products",
        text: "Public product pages: the offer, the comparison, and the questions a buyer asks. Named here as product pages, without internal system names or performance figures.",
        href: "/portfolio/superpatch-products/",
        link: "SuperPatch products",
      },
      {
        title: "StrongFoam website",
        text: "A public site where a visitor can start an estimate and book, so the request stays with the page.",
        href: "/portfolio/strongfoam-website/",
        link: "StrongFoam website",
      },
      {
        title: "StrongFoam CRM/ERP",
        text: "The record you work in: the customer, the job, and the numbers, in one place.",
        href: "/portfolio/strongfoam-crm/",
        link: "StrongFoam CRM/ERP",
      },
      {
        title: "Renew Implants",
        text: "The website, the social posts, and the blogs. The site says what the work is. The posts and the blogs are what a person can read before they enquire.",
        href: "/portfolio/renew-implants/",
        link: "Renew Implants",
      },
      {
        title: "pirx.ca",
        text: "The app, and the blogs beside it. The search record for the blogs lives on the portfolio note and on the AI visibility page. It is not repeated as a claim about every application.",
        href: "/portfolio/pirx/",
        link: "pirx.ca",
        shots: pirxCustomAppShots,
      },
    ],
    faqs: [
      ["Do the tools you already pay for have to go?", "No. Only the pile that is actually in the way changes. A tool people already like can stay, and the plan says which is which."],
      ["Will my staff need training?", "It's built around how they already work, so it feels familiar on day one."],
      ["Who owns the data?", "You do. You can export the record. It is not locked to a format you cannot leave."],
      ["How is the fit checked?", "You run last week's real work through it before it becomes the system of record. A demo with sample rows is not that test."],
      ["Will every department be rebuilt?", "No. One job, end to end. A second job is a second project."],
      ["What does it cost?", "Priced to the project. Tell us what you need and we'll quote it."],
    ],
    close: "Show us the spreadsheet you rely on most, and we'll show you the app it could become.",
  }),
  "ai-media": page({
    short: "AI media",
    title: "On-brand images, video and voice, on demand",
    headline: "On-brand images, video and voice, on demand.",
    description: "We draft images, video, and voice from material you already have, and a named person clears each file before it goes public.",
    dek: "Images, clips, transcripts and voiceovers made from your own material, approved by you before anything goes public.",
    strip: [
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "Content that starts with your brand, not a blank prompt.",
    problem: [
      "Pages go out without visuals, and recordings sit untranscribed because nobody has time.",
      "A generated picture that ignores your material is worse than no picture: the wrong claim, the wrong label, a face you do not have the right to use. Fast is only useful if it's right, so every file gets a human check.",
    ],
    outcomes: [
      { title: "A draft from your inputs", text: "The image, the transcript, the clip, or the voice starts from the file, the footage, or the description you supplied." },
      { title: "Words a person can check", text: "Short labels are read by a person before they are public. Important wording is added as real text, so it's always spelled right." },
      { title: "Your approval, every time", text: "Nothing is posted, mailed, or placed on a page until the person you named for that file has cleared it." },
      { title: "The file, ready to use", text: "The cleared asset is stored with a record of which draft was chosen, in a format the site or the post can use." },
    ],
    uses: [
      { title: "A picture for a page about to publish", text: "Describe the shot you need and pick your favourite from a set of drafts." },
      { title: "A transcript of a recording", text: "The recording stays the source. The transcript is a reading copy a person can correct before anyone quotes it." },
      { title: "A short clip from footage you already shot", text: "Cut from footage you've already shot, with your message on it." },
    ],
    compareIntro: "A template library, a designer or editor on staff, and a draft-then-review path fit different volumes.",
    rows: [
      { label: "Where the asset starts", shelf: "A stock frame or a one-click generator.", hire: "A person's time, from a blank page.", us: "Your file, footage, or description." },
      { label: "Who may publish", shelf: "Whoever exports, unless the tool is locked.", hire: "The person, if they remember the rule.", us: "The person you named for that file. The draft cannot post itself." },
      { label: "When the words matter", shelf: "The picture often misspells them.", hire: "They set the type by hand.", us: "Exact wording is added as text and checked." },
      { label: "When you don't need us", shelf: "Publishing is rare, a person already makes the asset by hand, and a stock image is honest about being stock. Keep that. Keep a designer when the piece is a flagship and a draft would waste their time.", hire: "A hire is the right call for a steady stream of original work that must be invented, not drafted.", us: "The fit is a volume higher than you can draft by hand, with a person still willing to clear every public file." },
    ],
    proofs: [
      {
        title: "Renew Implants",
        text: "Renew Implants includes the social posts and the blogs beside the website. The posts are the public media. A person cleared what went out. A metric or a quote is not added on this page.",
        href: "/portfolio/renew-implants/",
        link: "Read the Renew Implants note",
      },
    ],
    faqs: [
      ["Will a picture of a customer be published?", "No, unless you supply that photo and the right to use it. Drafts start from the description, the file, or the footage you provided."],
      ["Are the files yours to use?", "You receive the file made for the use that was agreed. It is not resold, and it is not dropped into someone else's work."],
      ["Can the text inside an image be trusted?", "No, not by default. A person checks short labels. If a line must be exact, it is set as text on the page."],
      ["Do transcripts replace the recording?", "They are a reading copy. If the words matter, the recording stays the source and the transcript is corrected against it."],
      ["Can it match a face from a photo found online?", "No. A person's likeness is not built from a picture you do not have rights to."],
      ["What if the whole set is wrong?", "Then nothing ships. We make a new set."],
    ],
    close: "Tell us about a visual you needed last week, and we'll show you what we'd make.",
  }),
  "ai-visibility": page({
    short: "AI visibility",
    title: "Get found in AI search",
    headline: "Get found in AI search.",
    description: "You decide which pages answer engines may read, and which crawlers stay out.",
    dek: "More customers ask AI tools before they ever visit a website. We make sure those answers point to you, and show you exactly who's reading your site.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "When customers ask AI, make sure it recommends you.",
    problem: [
      "A buyer asks a question you have already answered in public. The reply they see names you, or it names someone else, or it quotes a page you retired. You cannot fix that by arguing with the model. You can shape it by what you publish, which pages you offer to be read, and which crawlers you refuse.",
      "Most sites can't see which AI tools visited last week. We decide which ones may read your site, which stay out, and make sure your best pages are ready to be quoted.",
    ],
    outcomes: [
      { title: "A note in your words", text: "A plain file tells a reader, human or crawler, what you do and which pages are the ones to cite. It does not invent a claim." },
      { title: "You choose who reads your site", text: "Let search tools in, keep data-harvesting bots out." },
      { title: "A page worth quoting", text: "The public page answers a real question in language you will stand behind. That is the material an answer engine has to work with." },
      { title: "A record of who came", text: "You can see the crawlers that fetched the site. You can read the report again." },
    ],
    uses: [
      { title: "A public page worth quoting", text: "The page that answers the question buyers already ask is the one the note points at. Older pages that contradict it are not left in the way." },
      { title: "A private page that should stay quiet", text: "A draft, a login, or an internal note is left out of the file and, where it matters, blocked. Public and private are different decisions." },
      { title: "A weekly look at who fetched the site", text: "A weekly view of which AI tools visited, so nothing catches you off guard." },
    ],
    compareIntro: "An SEO retainer, a hire, and a visibility system promise very different things. None of them can force a model to mention you.",
    rows: [
      { label: "What is actually delivered", shelf: "A tool's score, or a monthly rank report.", hire: "Pages, if the person also writes.", us: "The note, the crawler rules, and pages you will stand behind." },
      { label: "What it cannot do", shelf: "Guarantee a mention.", hire: "Guarantee a mention.", us: "No one can guarantee a mention, and we won't pretend to." },
      { label: "What can be seen", shelf: "The vendor's chart.", hire: "Whatever they choose to report.", us: "Who crawled, what the note says, and which pages it points at." },
      { label: "When you don't need us", shelf: "The site is new, it has almost no public pages, and it is not ready for a crawler to quote. Do not invite that. Publish the page first. A tracker will not invent a page worth citing.", hire: "A writer on staff is the right hire when the missing piece is the article itself and the question is already known.", us: "The fit is pages that exist, or pages being written with you, and a deliberate say in what gets read." },
    ],
    proofs: [
      {
        title: "pirx.ca",
        text: "From near-zero to 375K search impressions and 43.5K AI-feature impressions in 90 days. Google Search Console, Jul 14 to Oct 13, 2026, also recorded 1.85K clicks and an average position of 7.6. The Generative AI features report is a separate count and is not added to the search total. Both curves start near zero in mid-July, step up around Aug 31, and reach daily peaks of about 12-18K in search and about 1.2-1.8K in AI features by mid-September. Those figures are this domain's, dated, and not a promise for the next one.",
        href: "/portfolio/pirx/",
        link: "Read the pirx.ca note",
        chart: true,
        shots: pirxVisibilityShots,
      },
      {
        title: "Renew Implants",
        text: "The Renew Implants blogs are the public pages beside the website and the social posts. They are named here as writing a person can read.",
        href: "/portfolio/renew-implants/",
        link: "Read the Renew Implants note",
      },
    ],
    faqs: [
      ["Does this guarantee a mention in answers?", "No. It makes the page worth quoting and tells crawlers what you want them to read. Being mentioned still depends on the engine."],
      ["Will a block hurt search?", "A block aimed at a training crawler is a different switch from a search crawler. Which is which is named before anything is blocked. If they cannot be told apart, nothing is blocked."],
      ["What is the plain-text note?", "A file on the site that introduces the business and lists the pages worth reading. People can read it too. Claims that are not on the site are not hidden there."],
      ["Are new pages required?", "Only if the current ones do not answer the question. Filler is not published to chase a crawler."],
      ["Can another site's numbers appear on yours?", "No. The pirx.ca figures stay attached to pirx.ca and to the date they were pulled. The next report belongs to the next domain."],
      ["How often do the figures move?", "The number on this page is the Google Search Console window Jul 14 to Oct 13, 2026. It is not refreshed from memory."],
    ],
    close: "Tell us what your customers ask, and we'll show you whether AI tools will point them to you.",
  }),
  "search-grounded-research": page({
    short: "Search-grounded research",
    title: "Research you can trust, with every source cited",
    headline: "Research you can trust, with every source cited.",
    description: "A research answer carries the public pages under every claim, so you can open the source and check it.",
    dek: "Get clear answers from the web with a source for every claim, so you can make decisions with confidence.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca blogs" },
    ],
    problemTitle: "Big decisions deserve real sources.",
    problem: [
      "An AI answer can sound right and still be out of date. Checking it by hand takes an hour you don't have.",
      "A chatbot will still answer without opening a page. Every answer here is backed by pages you can open.",
    ],
    outcomes: [
      { title: "The links stay attached", text: "Every claim links to its source." },
      { title: "A refusal when the web is thin", text: "If the search does not support the answer, the reply says so. It does not smooth the gap into a paragraph." },
      { title: "Public sources only", text: "It reads what anyone can open online, and keeps your private files out of it." },
      { title: "An answer you can keep", text: "Save answers with their links for later." },
    ],
    uses: [
      { title: "A claim checked against this month", text: "The question is whether a public statement is still true. The reply shows the pages, including one that contradicts it if that page exists." },
      { title: "A short answer before a meeting", text: "The question is specific. The reply is short, with the links under it, so the room can open the page that matters." },
      { title: "Two public sources, side by side", text: "The question asks for the disagreement, not a blend. The reply keeps the two pages apart and says where they differ." },
    ],
    compareIntro: "A chatbot, a researcher on staff, and a sourced answer are different levels of trust.",
    rows: [
      { label: "What can be checked", shelf: "Often nothing. The paragraph is the product.", hire: "Their notes, if they keep them.", us: "The page under the claim." },
      { label: "When the source is missing", shelf: "A fluent answer may still arrive.", hire: "They say they could not find it, or they fill the gap.", us: "The reply says it could not find a page." },
      { label: "What it will not read", shelf: "It depends on the product, and is easy to forget.", hire: "Whatever they can log into.", us: "Public pages only. Private files belong in document search." },
      { label: "When you don't need us", shelf: "If the answer is already in your files, use them. For a casual question, a normal chat is fine.", hire: "A researcher is the right hire when the question needs interviews, judgment, or access that cannot be put on the public web.", us: "The fit is a public fact, a real decision, and an unsourced paragraph that would be dangerous to trust." },
    ],
    proofs: [
      {
        title: "The pirx.ca blogs",
        text: "The blogs on pirx.ca are the public record of this kind of work: pages written to answer a question, with the search history kept on that portfolio note. This page does not repeat the figures. Open the note for the dated Search Console pull.",
        href: "/portfolio/pirx/",
        link: "Read the pirx.ca note",
      },
    ],
    faqs: [
      ["How is this different from asking a chatbot?", "The answer has to point at pages. If it cannot find a page, it says so."],
      ["Can it read pages behind a login?", "No. It reads public pages. Private files belong in answers from your documents, not here."],
      ["Will it cite a page it did not open?", "No. Every claim meant to be trusted carries a link you can open. A remembered citation is not good enough."],
      ["Is the answer advice?", "It gives you the facts and sources. The decision is yours."],
      ["How current is it?", "As current as the pages opened for that run. A saved answer is frozen on that day. Ask again if the week matters."],
      ["Can this replace someone who knows the field?", "No. It shortens the reading. A person who knows the field still decides what the pages mean."],
    ],
    close: "Bring a question you need answered before your next decision, and we'll show you a sourced answer.",
  }),
};
