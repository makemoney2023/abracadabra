/** Sales copy for /services/. Industry nouns stay off these pages. Named proof is only work Christopher cleared. */

import { pirxCustomAppShots, pirxVisibilityShots } from "./pirx-shots.mjs";

export const READINESS_URL = "https://check.abra-ca-dabra.app/check";

export const processIntro = "You tell us the job. We plan it, build it, and keep it running.";

export const processSteps = [
  {
    title: "Plan",
    text: "You tell us the job, the rules, and the moments that still belong to a person. We write that down before anything is built, so the build has one picture of how you work.",
  },
  {
    title: "Build",
    text: "We build it on Cloudflare and connect the records you already keep, so the work continues in the tools you already use.",
  },
  {
    title: "Review",
    text: "We test it on last week's real work. A customer-facing step goes live only after that test.",
  },
  {
    title: "Launch and run",
    text: "It goes live with the first runs watched. You can change the rules, and you leave with the system.",
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
    dek: "The next reply already knows this customer. A booking, a status, or a follow-up is completed in the system you already use. A question outside your rules reaches a person, with the thread intact.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/services/safe-code-execution/", label: "Safe code execution" },
    ],
    problemTitle: "The conversation ends before the work begins",
    problem: [
      "Customers ask the same questions every day, often after you have moved on to something else. Each new message arrives without the history of who they are, what they asked, and which rule applies. You send a familiar paragraph, and the booking or the follow-up still has to happen in another system. The conversation and the work never meet.",
      "A chat window can talk. It does not know this customer, and it cannot finish the request in the system you already use. When it guesses, the customer is the one who discovers the mistake. The assistant that belongs here answers from your rules, completes the request, and brings a person in when the question leaves that ground.",
    ],
    outcomes: [
      { title: "A conversation that continues", text: "The next reply already knows what this customer said. Another person's history stays out of the thread." },
      { title: "A request that is finished", text: "A booking, a status, or a callback is completed in the system you already use. Anything else waits for a person." },
      { title: "A handoff with the context", text: "When the question sits outside your rules, a person receives the thread and the facts already gathered." },
      { title: "A record of the work", text: "The action, the rule it followed, and the moment it stopped for a person remain visible afterward." },
    ],
    uses: [
      { title: "After-hours questions", text: "The assistant answers the questions you have already written down. Everything else waits until morning, with the thread attached." },
      { title: "Status on an open request", text: "It reads the record you already keep and says where the work stands, so you are not hunting a second inbox for the same fact." },
      { title: "A routine request, completed", text: "A booking, a callback, or a form is completed in the system you already use. The customer is not asked to start the request again." },
    ],
    capability: {
      title: "A small program, run safely",
      text: "Safe code execution ships inside this assistant. When the assistant needs to run a small program, it runs inside a sandbox. Time, files, and access are set before it starts.",
      href: "/services/safe-code-execution/",
      label: "See how safe code works",
    },
    compareIntro: "A chat product, a new hire, and a system built around the job are three different purchases. The difference is the work that comes back.",
    rows: [
      { label: "What it knows", shelf: "A general model, plus whatever help text was pasted in.", hire: "Whatever the new person has learned so far.", us: "Your rules and the records that are connected, and nothing else." },
      { label: "What it may do", shelf: "It can talk. Completing the request stays with a person.", hire: "The whole job, at the speed of one person.", us: "Only the actions on the list. Everything else is a handoff." },
      { label: "Who keeps it honest", shelf: "The vendor's roadmap and the pasted text.", hire: "A salary, and a handover when that person leaves.", us: "You hold the rules, and a customer-facing step is checked against last week's work." },
      { label: "When off the shelf wins", shelf: "A chat window is enough this week, the questions fit on one page, and it is fine if the request is never finished. Buy that product.", hire: "A hire does not make a generic chat window better. Staffing a job a finished product already does is the wrong purchase.", us: "The recommendation is to buy the product. A custom assistant is the wrong build for a five-line script." },
    ],
    proofs: [
      {
        title: "SuperPatch products",
        text: "SuperPatch products are public pages a buyer can read: the offer, the comparison, and the questions. The assistant sits beside that record, so a reply can follow the product already published. Internal system names and performance figures stay off this page.",
        href: "/portfolio/superpatch-products/",
        link: "Read the SuperPatch products note",
      },
    ],
    faqs: [
      ["Will it invent an answer?", "It answers from the rules and the records you give it. When those do not cover the question, it says so and hands the conversation to a person."],
      ["Can it take actions, or only chat?", "Both, within the jobs on the list. A booking or a status update is an action. Anything outside that list waits for a person."],
      ["Does it remember an earlier conversation?", "Yes, for the customer or the thread that is connected. A new person does not see someone else's history."],
      ["What has to be maintained?", "The rules and the facts. When a policy or a price changes, you update that source, and the assistant follows the new version."],
      ["Can it email a customer on its own?", "Only for the messages on the list, and only after you have reviewed that step. A surprise message is a failed design."],
      ["What does it cost?", "Contact for pricing. The price follows the job, not a public rate card. There is no seat price on this page."],
    ],
    close: "Bring one request you repeat every week. We show where the assistant answers, where it completes the request, and where a person still steps in.",
  }),
  "answers-from-your-documents": page({
    short: "Answers from your documents",
    title: "Instant answers from your own documents",
    headline: "Instant answers from your own documents.",
    description: "Ask in plain language. We answer from your files, and every answer carries the page it came from.",
    dek: "Handbooks, policies, price sheets, and manuals already hold the answer. You ask in plain language. We return that answer with the page attached, so you can open the sentence and check it.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "The answer exists, and you cannot reach it",
    problem: [
      "The policy, the price, or the clause is already written. Reaching it means opening the wrong folder, asking the person who wrote it, or trusting a paragraph someone pasted into chat last month. The file and the answer drift apart, and two people give two versions of the same rule.",
      "Search across a shared drive returns files, not the sentence. A general model returns a fluent paragraph that may not be your rule at all. You should not have to remember which folder holds the current rule. The product that belongs here is narrower: the current file, the page, and a clear stop when your documents do not contain the answer.",
    ],
    outcomes: [
      { title: "A plain question", text: "You or a customer ask the way you already talk. The file name is not required." },
      { title: "The page, attached", text: "The answer points at the page it came from, so you can open the sentence and read it." },
      { title: "The current file", text: "When you replace a policy, the next answer reads the new file. An older paragraph does not keep winning because it was uploaded first." },
      { title: "A stop when the files are silent", text: "If your documents do not contain the answer, we say so. We do not fill the gap with a general guess." },
    ],
    uses: [
      { title: "A policy lookup", text: "Someone asks what the rule is. The answer quotes the policy on file and links the page." },
      { title: "A part, a price, or a clause", text: "The question is specific. The reply comes from the sheet or the contract you already trust, with the line it used." },
      { title: "A staff question that should not wait", text: "The handbook already covers it. The person gets the paragraph and returns to the work. You are interrupted only when the file is silent." },
    ],
    compareIntro: "A shared drive, a person who knows the files, and a system that answers from them are not the same purchase.",
    rows: [
      { label: "What comes back", shelf: "A list of files that might match the words.", hire: "The paragraph, once someone has time.", us: "The answer, with the page it came from." },
      { label: "Which version", shelf: "Whichever file the search ranks, including the old one.", hire: "Whichever copy that person trusts.", us: "The file you marked current." },
      { label: "When it should refuse", shelf: "It still offers a closest match.", hire: "The answer may come from memory.", us: "It says your files do not contain it." },
      { label: "When off the shelf wins", shelf: "A handful of files, one person who knows them, and you can wait. A folder with a careful name is enough. Buy nothing custom.", hire: "Hiring a person to read ten pages is a meeting, not a system.", us: "The recommendation is to keep the folder. Document search earns its place when the files are many and the same question keeps arriving." },
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
      ["Does it work on a scan?", "If the scan has text that can be read, yes. A photo of a page with no text layer is called out, not guessed."],
      ["Who decides which file is current?", "You do. The system follows that mark. It does not elect a winner by popularity."],
      ["What does it cost?", "Contact for pricing. The price follows the number of files and the jobs that read them, not a public rate card."],
    ],
    close: "Bring the question you ask every week and the file that should have answered it. We show the answer, the page, and the stop when the file is silent.",
  }),
  "any-model-one-bill": page({
    short: "Any model, one bill",
    title: "Every AI model. One bill",
    headline: "Every AI model. One bill.",
    description: "Each job uses the model that fits it. You get one gateway and one bill you can cap and stop.",
    dek: "A short draft, a careful answer, and an image do not have to share one model. They share one gateway, one bill, and a switch that turns a model off without unwiring the rest.",
    strip: [
      { href: "/#models", label: "The models on this site" },
    ],
    problemTitle: "A second model should not mean a second account",
    problem: [
      "The second model arrives because the first one is wrong for part of the work. It also arrives as a new login, a new key, and a new invoice written in that vendor's words. Someone on your side becomes the person who knows where the keys live. When they leave, the map leaves with them.",
      "A single model for every job is the other failure. The draft is slow, the careful answer is sloppy, or the image comes from a product that was never meant to write. The useful shape is a gateway: the model matches the job, the usage sits on one bill, and a model that is not earning its place can be turned off.",
    ],
    outcomes: [
      { title: "One gateway", text: "The models you use are called through one place. Adding one does not mean a new vendor login for everyone." },
      { title: "The model matches the job", text: "A short draft, a careful answer, and an image do not have to share a single model. You can change the choice." },
      { title: "A bill you can stop", text: "Usage sits on one bill. If a model is not earning its place, you turn it off without unwiring the rest of the work." },
      { title: "No invented spend story", text: "We do not publish anyone's invoice here. The proof is the gateway itself, and the providers named on the homepage." },
    ],
    uses: [
      { title: "A draft, then a check", text: "A fast model writes the first pass. A second model, or a person, checks the claims. The review is not locked to the writer." },
      { title: "An image or a transcript beside the text", text: "The job needs a different provider than the one that writes paragraphs. It still lands in the same system and on the same bill." },
      { title: "Turning a model off", text: "A provider changes price or quality. You stop sending that model work. The jobs that remain keep running on the models you left in place." },
    ],
    compareIntro: "One vendor account, a person who manages keys, and a gateway are different amounts of work.",
    rows: [
      { label: "How a model is added", shelf: "A new account, a new key, a new invoice.", hire: "Someone on staff learns that vendor and keeps the key safe.", us: "You add it on the gateway you already have." },
      { label: "How the cost is read", shelf: "One vendor at a time, in that vendor's words.", hire: "A spreadsheet, if someone maintains it.", us: "One bill, with the model named on the usage." },
      { label: "How it stops", shelf: "Close that account and rewire what used it.", hire: "The knowledge leaves with the person.", us: "You turn the model off. The other jobs stay." },
      { label: "When off the shelf wins", shelf: "One model, a bill that is already clear, and no plan to switch. Stay. A gateway you do not need is another thing to watch.", hire: "A hire to manage a single key is overhead.", us: "The recommendation is to stay on the one vendor. The gateway earns its place when the second model shows up." },
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
      ["Is this a discount on model prices?", "No. The models you use are paid for through one bill. A rate is not advertised here, and a cheaper token is not promised."],
      ["Where do the prompts and files go?", "Through the gateway, on Cloudflare. The provider that actually runs the model is named. A prompt is not quietly copied onward."],
      ["Can a model you already pay for stay?", "If it is on the gateway, yes. A working account does not have to be thrown away to start."],
      ["What if a provider has an outage?", "The job can fall back to another model already on the list, or it can wait. You write that choice down. A model you never allowed is not swapped in quietly."],
      ["Who holds the keys?", "The gateway holds the provider keys. They are not pasted into personal accounts. Removing a person does not mean hunting for keys."],
    ],
    close: "Name the two jobs that should not share a model. We show the route, the bill, and the switch that turns one of them off.",
  }),
  "voice-and-realtime-agents": page({
    short: "Voice",
    title: "AI that answers your phone",
    headline: "AI that answers your phone.",
    description: "Callers hear an answer from your records. When the call needs a person, we hand it over with a note of what was already said.",
    dek: "Hours, status, and what to bring come from the records you already keep. When the call leaves that list, a person receives the line and a short note of what was already said.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "The line should know what your records already know",
    problem: [
      "Callers ask for a fact that is already written down, then wait because the person who can read the file is on another line. The message that follows asks them to repeat the details. The next morning someone enters those details into the same record the line could have read.",
      "A voice product that improvises is worse than hold music. A plausible sentence about a price, a time, or a name becomes a fact you have to unwind. The line should say what your record says, and it should reach a person when the question needs one.",
    ],
    outcomes: [
      { title: "An answer from the record", text: "The line says what your record says. It does not fill a silence with a plausible sentence." },
      { title: "A handoff you can hear", text: "When the call leaves the list, a person receives the line and a short note of what was already said." },
      { title: "A limit on what it may do", text: "It can book, confirm, or take a message when that action is on the list. It cannot change a record that is not." },
      { title: "A recording of the run", text: "You can replay the call and the note. A bad answer becomes a specific fix." },
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
      { label: "When off the shelf wins", shelf: "The volume is a few calls a day, and a person already answers them well. Keep that. A voice system for a quiet line is overhead.", hire: "A hire is right when the calls need judgment all the way through and the record would not shorten them.", us: "The recommendation is to keep the person on a quiet line. The voice system earns its place when the same facts are repeated and the exceptions still need a person." },
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
      ["Are calls stored?", "The calls you choose to keep, for the reason you write down. You can turn retention off. We do not keep a private copy for the studio."],
      ["Can it take a payment on the call?", "Only if that action is on the list and the payment path is one you already use. Otherwise it books a person."],
      ["Does this replace the people on the phone?", "It takes the calls on the list. The calls that need judgment still go to a person. If the volume does not justify that split, the recommendation is to leave the line alone."],
    ],
    close: "Bring one call from last week that should have been answered from the record. We mark the sentence the line may say, and the sentence that belongs to a person.",
  }),
  "web-automation": page({
    short: "Web automation",
    title: "Put repetitive web work on autopilot",
    headline: "Put repetitive web work on autopilot.",
    description: "The weekly browser job opens the same pages, collects the same numbers, and leaves a report you can open.",
    dek: "The same login, the same fields, the same destination. The path is stable, the run follows it the same way every time, and the exceptions land with a person.",
    strip: [
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
    ],
    problemTitle: "Repeated work deserves a system",
    problem: [
      "A report is collected, a form is completed, a row is carried into the sheet the rest of your business trusts. The steps fit on a card. They still depend on someone remembering the order, the login, and the exception that does not look like the others. On a busy day the step is skipped, and the downstream number is wrong without a trace of which run caused it.",
      "A macro on one laptop dies when the site moves a button. A person hired to click is consistent only while they are at the desk. The work is the path, and the path should hold.",
    ],
    outcomes: [
      { title: "The same steps", text: "The path on the list runs the same way on Tuesday as it did on Monday. A skipped field is a failed run, not a quiet blank." },
      { title: "Exceptions in a queue", text: "A page that does not match, a login that fails, a total that looks wrong: a person receives that run. The rest continue." },
      { title: "A log you can open", text: "Each run says what it opened, what it wrote, and where it stopped." },
      { title: "One write, in the place you named", text: "The value is written once, into the place you named. It does not have to be pasted again to become official." },
    ],
    uses: [
      { title: "A weekly file into a report", text: "The same export arrives every week. The run places it in the report you already read, and it stops if a column is missing." },
      { title: "A form that should arrive once", text: "A request already captured on a page is entered into the system of record. The visitor is not asked to send it again by email." },
      { title: "A check against a public page", text: "A status, a price, or a listing you are allowed to read is compared with the copy on file. A mismatch is raised. A match is left alone." },
    ],
    compareIntro: "A browser plugin, a person clicking, and a run that is operated fail in different places.",
    rows: [
      { label: "When the page moves", shelf: "The plugin breaks on that laptop.", hire: "The person notices, or they do not.", us: "The run stops and the log says which step failed." },
      { label: "Who can see it", shelf: "Whoever sits at that computer.", hire: "The person, plus whoever they told.", us: "The log, for the people you grant access." },
      { label: "What happens to the odd one", shelf: "It is skipped, or it is entered wrong.", hire: "They handle it if they notice.", us: "It waits for a person. The clear runs finish." },
      { label: "When off the shelf wins", shelf: "The task happens once a month, the page is stable, and a person can spare the ten minutes. A reminder and a checklist are enough. A site that changes every week is a moving target and should stay with a person.", hire: "A hire to click a stable monthly form is a poor use of a person. A hire to handle the exceptions is still right.", us: "A path that does not hold still is refused. Automation earns its place when the same clicks happen often enough to be wrong in public." },
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
      ["Is this a bot that browses the web all day?", "No. It runs the path you named, on the schedule you named. It does not wander."],
    ],
    close: "Bring the path someone repeated this week. If the steps hold still, we mark what the run may do and what must wait for a person.",
  }),
  "safe-code-execution": page({
    short: "Safe code execution",
    title: "Let AI run code, safely",
    headline: "Let AI run code, safely.",
    description: "When your assistant needs to run a small program, it runs inside a sandbox. Time, files, and access are set before it starts.",
    dek: "This ships inside an AI assistant, not as a machine of its own. Your assistant may run a small job already on the list, inside a sandbox of time, files, and what it is allowed to touch.",
    lead: {
      before: "It ships with the assistant it belongs to.",
      href: "/services/ai-assistants-and-agents/",
      label: "AI assistants and agents",
      after: " A conversation that only needs to talk does not need it.",
    },
    strip: [
      { href: "/services/ai-assistants-and-agents/", label: "AI assistants" },
    ],
    problemTitle: "A finished task is more than a reply",
    problem: [
      "Some jobs are not a sentence. They are a calculation, a file checked against a rule, a draft built from rows you already have. A person copies the numbers out, runs them, and pastes the result back. The assistant could take that step. Giving it a whole computer is how a small task becomes an incident.",
      "The useful version is narrow. The assistant may run the task you named, on the files you named, for a length of time you named. When it reaches that bound, it stops and tells a person. This page is that sandbox. The assistant page is the system that talks to your customer.",
    ],
    outcomes: [
      { title: "A task, not a blank console", text: "The job is specific: this calculation, this check, this draft. A request to do something else is refused." },
      { title: "Bounds you can point at", text: "Time, memory, and which files it may read or write are set before it runs. Those bounds are part of the plan." },
      { title: "A result you can read", text: "The output comes back to the assistant with what it used. You can run it again or throw it out." },
      { title: "A stop that is loud", text: "If the task exceeds the bound or asks for something off the list, it stops. The log says why. It does not retry its way around the fence." },
    ],
    uses: [
      { title: "A calculation from rows you trust", text: "The assistant takes numbers already in the file and returns the total the rule describes. It does not reach for a different spreadsheet because the first one was inconvenient." },
      { title: "A check before something is sent", text: "A file is tested against the rule you wrote: required fields, a total that matches, a name that exists. Failures go to a person with the reason." },
      { title: "A draft from a template", text: "The task fills a template already on the list. It does not invent a new template, and it does not send the result. Sending stays a separate step." },
    ],
    compareIntro: "Letting a model loose on a laptop, hiring someone to run the sheet, and a fenced task are different risks.",
    rows: [
      { label: "What it can touch", shelf: "Whatever the plugin or the laptop can touch.", hire: "Whatever that person can open.", us: "The files and the actions on the list, for the time that was set." },
      { label: "When it fails", shelf: "The miss may show up later.", hire: "They notice if they are looking.", us: "The run stops and the reason is in the log." },
      { label: "Who sends the result", shelf: "Sometimes the tool does, if the toggle was on.", hire: "The person, when they are trusted to.", us: "A person, unless sending is explicitly on the list." },
      { label: "When off the shelf wins", shelf: "The assistant only needs to talk, or the task is one formula in a sheet a person already opens. A code runner does not belong behind a conversation that never needed one.", hire: "A person running a weekly sheet by hand is fine when the sheet is small and the cost of a miss is low.", us: "This stays out of the assistant when the job is conversation only. The sandbox earns its place when a task is repeated and a wrong write would be expensive." },
    ],
    proofs: [
      {
        title: "It ships inside the assistant",
        text: "There is no separate public story for a code runner, and one will not be invented. The public shape is the assistant that answers and finishes the request. This page is the sandbox around the job that runs.",
        href: "/services/ai-assistants-and-agents/",
        link: "Read the assistant page",
      },
    ],
    faqs: [
      ["Is this a server to rent and forget?", "No. It is a task the assistant runs, inside a sandbox, on Cloudflare. An open machine and a password are not part of the delivery."],
      ["Can it install whatever package it wants?", "No. Dependencies are the ones on the list. A request to fetch something new stops."],
      ["Can it reach production records?", "Only the read or write you named. A wide credential is a failed plan. The task should be unable to see a table rather than able to see all of them."],
      ["What if the model writes bad code?", "The task still runs inside the sandbox, and the result is not sent until the review you set. A crash is a log line, not a change to the record."],
      ["Do you have to read the code?", "You read the task in plain language: what it may open, what it may write, and when it must stop. We maintain the code."],
      ["Can this be bought without an assistant?", "The page stays up so the sandbox is easy to find. The thing that ships is the assistant with this capability turned on for the tasks on the list. Without an assistant, there is nothing to fence."],
    ],
    close: "Name one task a person copies out of a thread and runs by hand. We show the sandbox around it, and whether it belongs in the assistant at all.",
  }),
  "custom-apps": page({
    short: "Custom apps",
    title: "Apps built around your workflow",
    headline: "Apps built around your workflow.",
    description: "We build the app around the way you already work, so the real job is the product.",
    dek: "The work already has an order. Rented tools were built for a different one, so the real job lives beside them. We build the screen around the way you already work.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
      { href: "/portfolio/strongfoam-crm/", label: "StrongFoam CRM/ERP" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
      { href: "/portfolio/pirx/", label: "pirx.ca" },
    ],
    problemTitle: "The application should follow the work",
    problem: [
      "The rented app has the right nouns and the wrong order. People export, repair the row somewhere else, and import, or they keep the side record and let the app go stale. A new hire learns that side record, not the product you pay for. The record of the business is whichever file was saved last.",
      "Buying another module adds a login. Hiring a developer without a written job adds a queue. The missing piece is usually small and specific: the estimate, the booking, the record you actually trust, the public page a buyer reads before they ask.",
    ],
    outcomes: [
      { title: "A screen in the real order", text: "The first thing you do in the morning is the first thing on the screen. Fields nobody uses are not there." },
      { title: "One record", text: "The customer, the job, and the number live in one place. A side record is a sign the application is not finished." },
      { title: "A public page when the job needs one", text: "If a buyer or a caller has to understand the offer before they talk to you, that page is part of the application, not a separate project that drifts." },
      { title: "A record you can leave with", text: "You can export the record. It is not kept in a format you cannot leave." },
    ],
    uses: [
      { title: "The record you work in", text: "Customers, jobs, and the numbers, in the order the day actually happens. The week no longer ends in a reconciliation between two tools." },
      { title: "A request that becomes work", text: "An estimate, a booking, or a form on the public site lands in the record. It does not have to be entered again to become real." },
      { title: "A page a buyer can finish", text: "The offer, the comparison, and the questions are on the page. The buyer arrives having read them, and you are not repeating the same explanation." },
    ],
    compareIntro: "A rented suite, a developer on staff, and an application built around one job solve different problems.",
    rows: [
      { label: "Fit", shelf: "The product's order. You adapt.", hire: "Whatever the person has time to finish.", us: "The way you already work, settled before the build." },
      { label: "What stays in your hands", shelf: "The vendor's updates, and the side record.", hire: "The person, the code, and the handover.", us: "The rules and the content. The build runs on Cloudflare." },
      { label: "When it is wrong", shelf: "You wait on a roadmap, or you work around it.", hire: "You wait on one person's queue.", us: "The screen changes, and you try it on last week's work." },
      { label: "When off the shelf wins", shelf: "A spreadsheet you like already does the job, or a rented app matches the order and people actually use it. Keep it. A custom application for a job the sheet does well is a hobby.", hire: "A full-time hire makes sense when there is a continuous stream of product changes and someone to manage them. One screen is not that job.", us: "The recommendation is to keep the sheet or the suite. The build starts when the side system has become the real one." },
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
      ["Can the people who use it skip a course?", "The first version is the path they already walk. A screen that needs a manual is not finished."],
      ["Who owns the data?", "You do. You can export the record. It is not locked to a format you cannot leave."],
      ["How is the fit checked?", "You run last week's real work through it before it becomes the system of record. A demo with sample rows is not that test."],
      ["Will every department be rebuilt?", "No. One job, end to end. A second job is a second project."],
      ["What does it cost?", "Contact for pricing. The price follows the job, not a public rate card. There is no seat price on this page."],
    ],
    close: "Bring the side record you actually trust. If that record is the product, we show the screen that replaces it. If the rented app is fine, that is the recommendation.",
  }),
  "ai-media": page({
    short: "AI media",
    title: "On-brand images, video and voice, on demand",
    headline: "On-brand images, video and voice, on demand.",
    description: "We draft images, video, and voice from material you already have, and a named person clears each file before it goes public.",
    dek: "A page needs a picture, a recording needs a transcript, a post needs a clip. Those drafts start from material you already have, and a named person clears the file before it is public.",
    strip: [
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "The asset should start from material you already have",
    problem: [
      "A page, a post, or a follow-up needs an image or a short clip, and the person who makes them is on something else. The page ships bare, or it waits. Recordings pile up because nobody has time to write down what was said. The words you already stand behind never reach the asset.",
      "A generated picture that ignores your material is worse than no picture: the wrong claim, the wrong label, a face you do not have the right to use. Speed without a review publishes the mistake.",
    ],
    outcomes: [
      { title: "A draft from your inputs", text: "The image, the transcript, the clip, or the voice starts from the file, the footage, or the description you supplied." },
      { title: "Words a person can check", text: "Short labels are read by a person before they are public. A line that must be exact is set as text, not left for the picture to spell." },
      { title: "A clear before it is public", text: "Nothing is posted, mailed, or placed on a page until the person you named for that file has cleared it." },
      { title: "The file, ready to use", text: "The cleared asset is stored with a record of which draft was chosen, in a format the site or the post can use." },
    ],
    uses: [
      { title: "A picture for a page about to publish", text: "You describe the shot and the words that must appear. Drafts come back. You choose one, or you reject the set. The page does not invent its own." },
      { title: "A transcript of a recording", text: "The recording stays the source. The transcript is a reading copy a person can correct before anyone quotes it." },
      { title: "A short clip from footage you already shot", text: "The cut uses your footage and the line you supplied. It is not a new scene starring people who were not filmed." },
    ],
    compareIntro: "A template library, a designer or editor on staff, and a draft-then-review path fit different volumes.",
    rows: [
      { label: "Where the asset starts", shelf: "A stock frame or a one-click generator.", hire: "A person's time, from a blank page.", us: "Your file, footage, or description." },
      { label: "Who may publish", shelf: "Whoever exports, unless the tool is locked.", hire: "The person, if they remember the rule.", us: "The person you named for that file. The draft cannot post itself." },
      { label: "When the words matter", shelf: "The picture often misspells them.", hire: "They set the type by hand.", us: "Exact lines are set as text and checked. The picture is not trusted to spell." },
      { label: "When off the shelf wins", shelf: "Publishing is rare, a person already makes the asset by hand, and a stock image is honest about being stock. Keep that. Keep a designer when the piece is a flagship and a draft would waste their time.", hire: "A hire is the right call for a steady stream of original work that must be invented, not drafted.", us: "The fit is a volume higher than you can draft by hand, with a person still willing to clear every public file." },
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
      ["What if the whole set is wrong?", "Then nothing ships. Rejection is a normal outcome of the review."],
    ],
    close: "Bring one asset you needed last week and did not have. We show the draft, the line a person must check, and the review that has to happen before it is public.",
  }),
  "ai-visibility": page({
    short: "AI visibility",
    title: "Get found in AI search",
    headline: "Get found in AI search.",
    description: "You decide which pages answer engines may read, and which crawlers stay out.",
    dek: "People ask a question and receive an answer without opening your site. You can still decide which pages are worth quoting, and you can see which crawlers actually came.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "Answer engines should quote the page you stand behind",
    problem: [
      "A buyer asks a question you have already answered in public. The reply they see names you, or it names someone else, or it quotes a page you retired. You cannot fix that by arguing with the model. You can shape it by what you publish, which pages you offer to be read, and which crawlers you refuse.",
      "Most sites do not show who fetched them last week. A block aimed at the wrong crawler can hide you from search. A wide-open site can hand a private page to a training run. The work is specific: the note, the allow list, the block list, and a page that deserves to be quoted.",
    ],
    outcomes: [
      { title: "A note in your words", text: "A plain file tells a reader, human or crawler, what you do and which pages are the ones to cite. It does not invent a claim." },
      { title: "A say in who crawls", text: "A search crawler can be allowed and a training crawler refused. Which is which is named before anything is blocked." },
      { title: "A page worth quoting", text: "The public page answers a real question in language you will stand behind. That is the material an answer engine has to work with." },
      { title: "A record of who came", text: "You can see the crawlers that fetched the site. You can read the report again. It is not a chart you have to trust on faith." },
    ],
    uses: [
      { title: "A public page worth quoting", text: "The page that answers the question buyers already ask is the one the note points at. Older pages that contradict it are not left in the way." },
      { title: "A private page that should stay quiet", text: "A draft, a login, or an internal note is left out of the file and, where it matters, blocked. Public and private are different decisions." },
      { title: "A weekly look at who fetched the site", text: "You can see the crawlers that came. A surprise visitor becomes a decision, not a mystery discovered months later." },
    ],
    compareIntro: "An SEO retainer, a hire, and a visibility system promise very different things. None of them can force a model to mention you.",
    rows: [
      { label: "What is actually delivered", shelf: "A tool's score, or a monthly rank report.", hire: "Pages, if the person also writes.", us: "The note, the crawler rules, and pages you will stand behind." },
      { label: "What it cannot do", shelf: "Guarantee a mention.", hire: "Guarantee a mention.", us: "Guarantee a mention. That is not for sale." },
      { label: "What can be seen", shelf: "The vendor's chart.", hire: "Whatever they choose to report.", us: "Who crawled, what the note says, and which pages it points at." },
      { label: "When off the shelf wins", shelf: "The site is new, it has almost no public pages, and it is not ready for a crawler to quote. Do not invite that. Publish the page first. A tracker will not invent a page worth citing.", hire: "A writer on staff is the right hire when the missing piece is the article itself and the question is already known.", us: "The fit is pages that exist, or pages being written with you, and a deliberate say in what gets read." },
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
        text: "The Renew Implants blogs are the public pages beside the website and the social posts. They are named here as writing a person can read. A search figure is not attached to them.",
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
    close: "Bring the question buyers already ask and the page that should be quoted. We say whether the page is ready, and what a crawler would be invited to read.",
  }),
  "search-grounded-research": page({
    short: "Search-grounded research",
    title: "Research you can trust, with every source cited",
    headline: "Research you can trust, with every source cited.",
    description: "A research answer carries the public pages under every claim, so you can open the source and check it.",
    dek: "A question your files do not cover still needs an answer you can check. The reply carries the links under the claims. If there is no page, there is no answer.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca blogs" },
    ],
    problemTitle: "A decision needs a source, not a paragraph",
    problem: [
      "Someone pastes a paragraph before a decision. It sounds current. It has no link. The person who has to own the decision either trusts it or spends an hour opening tabs to see whether it is real. Trusting it is how a stale page becomes a fact inside your business. Rechecking it by hand is the job the tool was supposed to do.",
      "A chatbot will still answer when it did not open a page. That is the wrong product for a question that has to be current. Your own documents are the wrong collection too, when the fact lives on the public web.",
    ],
    outcomes: [
      { title: "The links stay attached", text: "A claim meant to be trusted carries a page. You can open the page. A sentence with no page is not a finding." },
      { title: "A refusal when the web is thin", text: "If the search does not support the answer, the reply says so. It does not smooth the gap into a paragraph." },
      { title: "Public pages only", text: "It reads what a stranger could open. A page behind a login is out of scope, on purpose." },
      { title: "An answer you can keep", text: "You can save the reply worth keeping, and the saved copy still has the links. It is a start, not a source." },
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
      { label: "When off the shelf wins", shelf: "The question is already answered in your own files, or a casual explanation is enough and nobody will act on it. Use the files, or use a normal chat. A sourced answer is the wrong weight for a curiosity.", hire: "A researcher is the right hire when the question needs interviews, judgment, or access that cannot be put on the public web.", us: "The fit is a public fact, a real decision, and an unsourced paragraph that would be dangerous to trust." },
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
      ["How is this different from asking a chatbot?", "The answer has to point at pages. If it cannot find a page, it says so. Fluency is not a source."],
      ["Can it read pages behind a login?", "No. It reads public pages. Private files belong in answers from your documents, not here."],
      ["Will it cite a page it did not open?", "No. Every claim meant to be trusted carries a link you can open. A remembered citation is not good enough."],
      ["Is the answer advice?", "It is a reading list with a summary. The decision stays with you. A source list is not dressed up as a recommendation to buy, sue, or treat."],
      ["How current is it?", "As current as the pages opened for that run. A saved answer is frozen on that day. Ask again if the week matters."],
      ["Can this replace someone who knows the field?", "No. It shortens the reading. A person who knows the field still decides what the pages mean."],
    ],
    close: "Bring a question that would otherwise be pasted into a chat before a decision. We show the answer with the links, or we show the refusal.",
  }),
};
