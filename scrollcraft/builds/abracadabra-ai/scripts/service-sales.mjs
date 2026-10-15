/** Sales copy for /services/. Industry nouns stay off these pages. Named proof is only work Christopher cleared. */

import { pirxCustomAppShots, pirxVisibilityShots } from "./pirx-shots.mjs";

export const READINESS_URL = "https://check.abra-ca-dabra.app/check";

export const processIntro = "The order is the same on every service. The job is what changes.";

export const processSteps = [
  {
    title: "Brief",
    text: "You tell us the job, the rules, and the moment a person has to say yes. We write that list before anyone builds. A step that is not on the list does not ship.",
  },
  {
    title: "Build",
    text: "We build it on Cloudflare and connect it to the records you already keep. The new system should not be a second place to type the same fact.",
  },
  {
    title: "People approve",
    text: "Your team runs last week's real work through it and marks what may go live. We do not put a customer-facing step in front of people on our say-so alone.",
  },
  {
    title: "Launch and run",
    text: "It goes live. We watch the first runs with you, fix what the real work shows, and leave the rules where your team can change them.",
  },
];

function page(entry) {
  return entry;
}

export const salesPages = {
  "ai-assistants-and-agents": page({
    short: "AI assistants",
    title: "Customers get an answer, then a filing",
    headline: "Customers get an answer, and the request gets filed.",
    description: "Customers get an answer from your rules, and the booking or follow-up gets filed where the team already works.",
    dek: "Customers should not have to repeat themselves, and your team should not retype a request that is already clear. The assistant remembers who they are, answers from the rules you wrote down, and files the booking or the follow-up.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/services/safe-code-execution/", label: "Safe code execution" },
    ],
    problemTitle: "The thread starts over, then someone retypes it",
    problem: [
      "The same questions land every day, and the person who knows the answer is already in another thread or has gone home. A new message starts from nothing: who this is, what they asked last time, and which rule applies now. Staff paste a paragraph they have sent before, then copy the details into a second tool so the job actually happens. The customer waits. The record is only as good as the person who remembered to type it.",
      "A chat box on the site can talk. It does not know this customer, and it cannot file the request where the team already works. When it guesses, you find out from the customer. The missing piece is the filing: a booking, a status, a callback, or a clean handoff, done the way you already decided.",
    ],
    outcomes: [
      { title: "A thread that continues", text: "The next reply knows what was already said, for that customer only. A different person does not see the history." },
      { title: "The request gets filed", text: "A booking, a status, a callback, or a form is filed where the team already looks. Anything else waits." },
      { title: "A handoff with the context", text: "When the question is outside the rules, a person gets the thread and the facts already collected, not a blank ticket." },
      { title: "A record of what it did", text: "You can see the action, the rule it followed, and the moment it stopped and asked for a person." },
    ],
    uses: [
      { title: "After-hours questions", text: "The assistant answers the questions you already wrote down. Everything else is waiting for a person in the morning, with the thread attached." },
      { title: "Status on an open request", text: "It reads the record you already keep and says where the job stands. Nobody hunts through a second inbox to find the same fact." },
      { title: "A routine request, filed once", text: "A booking, a callback, or a form lands in the tool the team already uses. The customer is not asked to repeat it, and staff are not asked to retype it." },
    ],
    capability: {
      title: "It can run a small job you listed",
      text: "Safe code execution ships inside this assistant. The assistant can run a small job you already listed, inside a limit you set: a calculation, a file check, a draft. It does not get a blank permission to do anything on the machine.",
      href: "/services/safe-code-execution/",
      label: "Read how the limit works",
    },
    compareIntro: "A chat product, a new hire, and a system we build are three different purchases. Here is the difference on the work itself.",
    rows: [
      { label: "What it knows", shelf: "A general model, plus whatever help text you pasted in.", hire: "Whatever the new person has learned so far.", us: "The rules and the records you connect, and nothing else." },
      { label: "What it may do", shelf: "Talk. Filing the request is still a person's job.", hire: "The whole job, at the speed of one person.", us: "Only the actions you listed. The rest is a handoff." },
      { label: "Who keeps it honest", shelf: "The vendor's roadmap and your pasted text.", hire: "You, plus a salary and a handover when they leave.", us: "Your team approves what goes live, then you keep the rules." },
      { label: "When off the shelf wins", shelf: "You need a chat box this week, the questions fit on one page, and you are fine if it cannot file the request. Buy that product.", hire: "A hire does not make a generic chat box better. Do not staff a job a finished product already does.", us: "We will say so in the brief and point you at the product. We do not build a custom assistant for a five-line script." },
    ],
    proofs: [
      {
        title: "SuperPatch products",
        text: "SuperPatch products are public pages a buyer can read: the offer, the comparison, and the questions. The assistant sits next to that record, so a reply can follow the product you already published instead of inventing one. We do not publish internal system names or performance figures for this work.",
        href: "/portfolio/superpatch-products/",
        link: "Read the SuperPatch products note",
      },
    ],
    faqs: [
      ["Will it invent an answer?", "It answers from the rules and the records you give it. When it does not know, it says so and hands the conversation to a person. A confident guess is a failed run, not a feature."],
      ["Can it take money or change a record on its own?", "Only the actions on the list you approved. A payment, a cancellation, or a change that is not on that list waits for a person. You can read what it did."],
      ["Does one customer see another's history?", "No. Memory is for the customer or the thread you connect. A new person starts clean."],
      ["What happens when a policy changes?", "You change the source the assistant reads. The next reply follows the new version. You do not retrain a person from a chat log."],
      ["We already have a chat tool. Why replace it?", "Keep it if it only needs to talk. Replace the path when the request still has to be retyped before anyone can act. We will tell you which of those you have."],
      ["Who is responsible when it is wrong?", "You approved the rules and the actions. We watch the first runs with you and change the rule that failed. The log shows the step, so the fix is specific."],
    ],
    close: "Bring one real thread from last week. We will show which step the assistant may take, and which step still belongs to a person.",
  }),
  "answers-from-your-documents": page({
    short: "Answers from your documents",
    title: "Answers from your own files",
    headline: "Ask a question. Get the answer from your own files.",
    description: "Ask a question in plain language. Get the answer from your own files, with the page it came from.",
    dek: "The answer is already in a handbook, a policy, or a price sheet. People still interrupt each other to find the paragraph. Ask in plain language and get the answer with the page it came from.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "The file is there. The answer still takes a person.",
    problem: [
      "Someone asks a question the company has already answered. The reply lives in a handbook, a policy, a price sheet, or a thread from last month. The person who knows which file opens it, scrolls, and pastes the paragraph. Everyone else waits, or they guess.",
      "Search inside a shared drive finds a document, not an answer. You still have to know the file name, and you still have to read it. When the wrong version is newer than the right one, the guess looks official.",
    ],
    outcomes: [
      { title: "A plain question", text: "Staff or a customer ask the way they already talk. They do not need the file name." },
      { title: "The page, not a paraphrase alone", text: "The answer points at the page it came from. You can open it and see the sentence." },
      { title: "The current file", text: "When you replace a policy, the next answer reads the new file. The old paragraph does not keep winning because it was uploaded first." },
      { title: "A stop when it is not in the files", text: "If the documents do not contain the answer, it says so. It does not fill the gap with a general guess." },
    ],
    uses: [
      { title: "A policy lookup", text: "Someone asks what the rule is. The answer quotes the policy you keep and links the page, instead of a manager retyping it from memory." },
      { title: "A part, a price, or a clause", text: "The question is specific. The reply comes from the sheet or the contract you already approved, with the line it used." },
      { title: "A staff question that should not wait", text: "The handbook already covers it. The person gets the paragraph and gets back to the job, and the manager is interrupted only when the file is silent." },
    ],
    compareIntro: "A shared drive, a librarian you hire, and a system that answers from the files are not the same thing.",
    rows: [
      { label: "What you get back", shelf: "A list of files that might match the words.", hire: "The paragraph, after someone has time.", us: "The answer, with the page it came from." },
      { label: "Which version", shelf: "Whichever file the search ranks, including the old one.", hire: "Whichever copy that person trusts.", us: "The file you marked current." },
      { label: "When it should refuse", shelf: "It still offers a closest match.", hire: "They may answer from memory.", us: "It says the files do not contain it." },
      { label: "When off the shelf wins", shelf: "You have a handful of files, one person knows them, and people can wait. A folder and a careful name is enough. Buy nothing custom.", hire: "Hiring a person to read ten pages is a meeting, not a system.", us: "We will say so. Document search earns its place when the files are many and the same question keeps arriving." },
    ],
    proofs: [
      {
        title: "No named case on this page yet",
        text: "This service does not yet have its own named public case. We will not borrow a client name to fill the gap. The portfolio lists the systems we can name, including records a team already works in.",
        href: "/portfolio/",
        link: "See the portfolio",
      },
    ],
    faqs: [
      ["Will it answer from the public internet?", "No. This service reads the files you give it. Questions that live on the public web belong in search-grounded research, and we keep the two apart."],
      ["What if two files disagree?", "You pick which file is current. Until you do, the answer shows both pages and does not pretend they say the same thing."],
      ["Can customers see internal files?", "Only the set you mark for them. A staff handbook and a customer policy are different piles, and the question is asked against one pile."],
      ["Does it work on a scan?", "If the scan has text we can read, yes. A photo of a page with no text layer is called out, not guessed."],
      ["Who updates the files?", "You do. We connect the place you already keep them. Replacing a file is the update."],
      ["Is the answer legal or financial advice?", "No. It shows what your document says. A decision that needs a qualified person still goes to that person."],
    ],
    close: "Bring the file people ask about most, and one question from last week. We will show the answer and the page, or we will show you that the file does not contain it.",
  }),
  "any-model-one-bill": page({
    short: "Any model, one bill",
    title: "One model bill you can stop",
    headline: "Pick the model for the job. One bill you can stop.",
    description: "Pick the model that fits the job. One bill you can stop, and no second account to manage.",
    dek: "The right model for a draft is often the wrong model for a careful answer. You should be able to switch without a second account, a second key, and a bill you cannot trace.",
    strip: [
      { href: "/#models", label: "Models on this site" },
    ],
    problemTitle: "Every new model arrives as another account",
    problem: [
      "A team starts with one model. Then a draft needs a different one, an image needs another, and a long document needs a third. Each vendor has its own key, its own invoice, and its own way of failing. Nobody can say what last month cost, or which job caused it.",
      "Switching gets postponed because the switch is a project. The team keeps using the model they already wired, even when it is the expensive one for a simple job or the weak one for a careful answer.",
    ],
    outcomes: [
      { title: "One gateway", text: "The models you approve are called through one place. Adding one does not mean a new vendor login for the whole team." },
      { title: "The model matches the job", text: "A short draft, a careful answer, and an image do not have to share a single model. You pick, and you can change the pick." },
      { title: "A bill you can stop", text: "Usage sits on one bill. If a model is not earning its place, you turn it off without unwiring the rest." },
      { title: "No invented spend story", text: "We do not publish a client's invoice. The proof on this page is the gateway itself, the providers named on the homepage." },
    ],
    uses: [
      { title: "A draft, then a check", text: "A fast model writes the first pass. A second model, or a person, checks the claims. You are not locked to the writer for the review." },
      { title: "An image or a transcript beside the text", text: "The job needs a different provider than the one that writes paragraphs. It still lands in the same system and on the same bill." },
      { title: "Turning a model off", text: "A provider changes price or quality. You stop sending it work. The jobs that remain keep running on the models you left in place." },
    ],
    compareIntro: "One vendor account, a person who manages keys, and a gateway are different amounts of work.",
    rows: [
      { label: "How you add a model", shelf: "A new account, a new key, a new invoice.", hire: "Someone on staff learns that vendor and keeps the key safe.", us: "You approve it on the gateway you already have." },
      { label: "How you see the cost", shelf: "One vendor at a time, in that vendor's words.", hire: "A spreadsheet, if someone maintains it.", us: "One bill, with the model named on the usage." },
      { label: "How you stop", shelf: "Close that account and rewire what used it.", hire: "The knowledge leaves with the person.", us: "Turn off the model. The other jobs stay." },
      { label: "When off the shelf wins", shelf: "You use one model, the vendor's bill is already clear, and you are not switching. Stay. A gateway you do not need is another thing to watch.", hire: "A hire to manage a single key is overhead.", us: "We will tell you to stay on the one vendor. The gateway earns its place when the second model shows up." },
    ],
    proofs: [
      {
        title: "The model list on this site",
        text: "The homepage names the gateway providers and the model families in two rows you can read. That list is the proof for this service. We do not attach a client's spend, and we do not imply a customer bought a seat.",
        href: "/#models",
        link: "See the models",
      },
    ],
    faqs: [
      ["Do we have to use every model on the list?", "No. The list is what we can route. You approve the ones this business may call. The others stay off."],
      ["Is this a discount on model prices?", "No. You pay for the models you use, through one bill. We do not advertise a rate, and we do not promise a cheaper token."],
      ["Where do the prompts and files go?", "Through the gateway, on Cloudflare. We name the provider that actually runs the model. A prompt is not quietly copied to a second place."],
      ["Can we keep a model we already pay for?", "If it is on the gateway, yes. You do not have to throw away a working account to start."],
      ["What if a provider has an outage?", "The job can fall back to another model you already approved, or it can wait. We write that choice in the brief. We do not silently swap in a model you never allowed."],
      ["Who holds the keys?", "The gateway holds the provider keys. Your team does not paste them into personal accounts. Removing a person does not mean hunting for keys."],
    ],
    close: "Tell us the two jobs that should not share a model. We will show the route, the bill you would be looking at, and the switch that turns one of them off.",
  }),
  "voice-and-realtime-agents": page({
    short: "Voice",
    title: "Callers get an answer",
    headline: "Callers get the answer. A person takes the call when they should.",
    description: "Callers get the answer from the facts you already keep. A person takes the call when the question needs one.",
    dek: "A caller should get the fact you already keep, in a voice that can pause and hand the call to a person. A script that cannot see your record just keeps them on the line.",
    strip: [
      { href: "/portfolio/", label: "Portfolio" },
    ],
    problemTitle: "The phone still depends on who is free",
    problem: [
      "Calls arrive while the person who can answer is with someone else. A queue plays music. A missed call becomes a voicemail nobody trusts, or a callback that starts the conversation from zero. The caller repeats the account, the order, or the question.",
      "A phone tree can route a button press. It cannot read the record and say where the job stands. A person still does that, if they pick up. After hours, they do not.",
    ],
    outcomes: [
      { title: "An answer from your facts", text: "The line says what the record says. It does not fill a silence with a plausible sentence." },
      { title: "A handoff you can hear", text: "When the call leaves the script, a person gets the line and a short note of what was already said." },
      { title: "A limit on what it may do", text: "It can book, confirm, or take a message if you approved that. It cannot change a record that is not on the list." },
      { title: "A recording of the run", text: "You can hear the call and read the note. A bad answer is a specific fix, not a feeling." },
    ],
    uses: [
      { title: "A question you already answer", text: "Hours, status, what to bring, where to send a file. The line reads the source you keep and says that, then offers a person if the caller needs more." },
      { title: "A booking or a callback", text: "The caller asks for a time or a call back. The request lands where the team already works, and the caller is not asked to leave the same details in a voicemail." },
      { title: "After the office is closed", text: "The line stays up. It answers the closed-hours list and takes the rest as a message a person sees in the morning, with the call attached." },
    ],
    compareIntro: "A phone tree, a receptionist you hire, and a line we build do different jobs.",
    rows: [
      { label: "What the caller gets", shelf: "A menu, then a queue.", hire: "A person, when they are free.", us: "The fact from your record, or a person with the context." },
      { label: "After hours", shelf: "A recording, if you set one.", hire: "Nobody, unless you staff the night.", us: "The list you approved, then a message." },
      { label: "When it is unsure", shelf: "It keeps offering buttons.", hire: "They ask a colleague or guess.", us: "It says so and transfers, with the note." },
      { label: "When off the shelf wins", shelf: "You take a few calls a day and a person always answers. A normal phone line is the whole product. Do not add a voice agent to a line that is already picked up.", hire: "Hiring for a handful of calls is a person you already have.", us: "We will tell you to keep the person on the phone. Build this when calls wait or the same fact is read aloud all day." },
    ],
    proofs: [
      {
        title: "No named voice case on this page",
        text: "We do not have a public voice build we are cleared to name here, and we will not point this page at unrelated work. The portfolio is the list of systems we can show. A voice line is a separate job from a website or a product page.",
        href: "/portfolio/",
        link: "See the portfolio",
      },
    ],
    faqs: [
      ["Will it sound like a person we employ?", "It sounds like the voice you pick, and it says only what the record supports. We do not imitate a named staff member."],
      ["Can it transfer to a real phone?", "Yes, to the number you set, with a short note of the call so far. If nobody picks up, it takes a message."],
      ["What about a noisy line or a strong accent?", "If it did not hear the question, it asks again. It does not guess a name or a number it did not catch."],
      ["Are calls stored?", "The calls you choose to keep, for the reason you write down. You can turn retention off. We do not keep a private copy for ourselves."],
      ["Can it take a payment on the call?", "Only if that action is on the approved list and the payment path is one you already use. Otherwise it books a person."],
      ["Does this replace the team on the phone?", "It takes the calls you listed. The calls that need judgment still go to a person. If your volume does not justify that split, we will say so."],
    ],
    close: "Play us one call from last week that should have been answered from the record. We will mark the sentence the line may say, and the sentence that must be a person.",
  }),
  "web-automation": page({
    short: "Web automation",
    title: "The weekly paste job runs itself",
    headline: "The weekly copy-and-paste job runs on its own.",
    description: "The weekly copy-and-paste job runs the same way every time. A person sees the exceptions.",
    dek: "Someone on the team logs into the same site, copies the same fields, and pastes them somewhere else. The steps are stable. The person is not. We run that path the same way every time and hand you the exceptions.",
    strip: [
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
    ],
    problemTitle: "The same clicks, on a person's worst day",
    problem: [
      "A report is downloaded, a form is filled, a row is copied into the sheet the rest of the company trusts. The steps fit on a card. They still depend on someone remembering the order, the login, and the exception that does not look like the others. On a busy day the step is skipped. The downstream number is then wrong, and nobody knows which run caused it.",
      "A macro on one laptop dies when the site moves a button. A person hired to click is consistent only while they are at the desk. The work is the path, not the heroics.",
    ],
    outcomes: [
      { title: "The same steps", text: "The path you approved runs the same way on Tuesday as it did on Monday. A skipped field is a failed run, not a quiet blank." },
      { title: "Exceptions in a queue", text: "A page that does not match, a login that fails, a total that looks wrong: a person gets that run. The rest continue." },
      { title: "A log you can open", text: "Each run says what it opened, what it wrote, and where it stopped. You do not have to ask who clicked." },
      { title: "No second typing", text: "The value is written once, into the place you named. A person is not asked to paste it again to make it official." },
    ],
    uses: [
      { title: "A weekly file into a report", text: "The same export arrives every week. The run files it into the report your team already reads, and it stops if a column is missing." },
      { title: "A form that should not be retyped", text: "A request already captured on a page is entered into the system of record. The visitor is not asked to send it again by email." },
      { title: "A check against a public page", text: "A status, a price, or a listing you are allowed to read is compared to the copy you keep. A mismatch is raised. A match is left alone." },
    ],
    compareIntro: "A browser plugin, a person clicking, and a run we operate fail in different places.",
    rows: [
      { label: "When the page moves", shelf: "The plugin breaks on that laptop.", hire: "The person notices, or they do not.", us: "The run stops and the log says which step failed." },
      { label: "Who can see it", shelf: "Whoever sits at that computer.", hire: "The person, plus whoever they told.", us: "The log, for the people you grant." },
      { label: "What happens to the odd one", shelf: "It is skipped or mistyped.", hire: "They handle it if they notice.", us: "It waits for a person. The clear runs finish." },
      { label: "When off the shelf wins", shelf: "You do the task once a month, the page is stable, and a person can spare the ten minutes. A reminder and a checklist are enough. Also: if the site you log into changes every week, do not automate a moving target. Wait until the steps hold still.", hire: "A hire to click a stable monthly form is a poor use of a person, but a hire to handle the exceptions is still right.", us: "We will refuse a path that is not stable. Automation earns its place when the same clicks happen often enough to be wrong in public." },
    ],
    proofs: [
      {
        title: "StrongFoam website",
        text: "The StrongFoam website takes the request on the page: a visitor can start an estimate and book, so the details are not retyped into a second tool. That is the public shape of this service. We do not add figures or a quote.",
        href: "/portfolio/strongfoam-website/",
        link: "Read the StrongFoam website note",
      },
    ],
    faqs: [
      ["Will it log in as one of our staff?", "It uses an account you create for the job, with only the access that job needs. It does not use a person's password."],
      ["What if the site shows a captcha or a surprise prompt?", "The run stops and a person gets it. We do not bypass a control the site put there to block automation."],
      ["Can it click through a site we do not own?", "Only where you have the right to act, with an account you control or a page that is public. We do not scrape a system you are not allowed to use this way."],
      ["How do we change a step?", "You change the brief, we change the run, and your team tries it on last week's file before it replaces the old path."],
      ["What if it writes the wrong value?", "The log shows the value and the field. You can reverse the runs you list. A write that is hard to undo is one we put behind a person's approval."],
      ["Is this a bot that browses the web all day?", "No. It runs the path you named, on the schedule you named. It does not wander."],
    ],
    close: "Show us the click-path someone repeated this week. If the steps hold still, we will mark what the run may do and what must wait for a person.",
  }),
  "safe-code-execution": page({
    short: "Safe code execution",
    title: "A small program, in a limit",
    headline: "A small program can run without touching the rest of the business.",
    description: "A small program runs inside a limit you set. It cannot touch the rest of the business. It ships with the assistant.",
    dek: "This is part of an AI assistant, not a separate product you buy on its own. The assistant may run a small job you already listed. The job runs inside a limit: time, files, and what it is allowed to touch.",
    lead: {
      before: "Read it with the assistant it belongs to.",
      href: "/services/ai-assistants-and-agents/",
      label: "AI assistants and agents",
      after: " If you only need the assistant to talk, you do not need this.",
    },
    strip: [
      { href: "/services/ai-assistants-and-agents/", label: "AI assistants" },
    ],
    problemTitle: "A chat reply is not a finished task",
    problem: [
      "Some jobs are not a sentence. They are a calculation, a file checked against a rule, a draft built from rows you already have. A person copies the numbers out, runs them, and pastes the result back. The assistant could do that step. Giving it a whole computer is how a small task becomes an incident.",
      "The useful version is narrow. The assistant may run the task you named, on the files you named, for a length of time you named. When it hits the fence, it stops and tells a person. The page you are reading is that fence. The assistant page is the thing that talks to the customer or the team.",
    ],
    outcomes: [
      { title: "A task, not a blank console", text: "You approve the job: this calculation, this check, this draft. A request to do something else is refused." },
      { title: "A limit you can point at", text: "Time, memory, and which files it may read or write are set before it runs. The limit is part of the brief, not a hope." },
      { title: "A result a person can read", text: "The output comes back to the assistant with what it used. A person can rerun it or throw it out." },
      { title: "A stop that is loud", text: "If the task exceeds the limit or asks for something off the list, it stops. The log says why. It does not retry its way around the fence." },
    ],
    uses: [
      { title: "A calculation from rows you trust", text: "The assistant takes numbers already in the file and returns the total the rule describes. It does not pull a different spreadsheet because the first one was inconvenient." },
      { title: "A check before something is sent", text: "A file is tested against the rule you wrote: required fields, a total that matches, a name that exists. Failures go to a person with the reason." },
      { title: "A draft from a template", text: "The task fills a template you approved. It does not invent a new template, and it does not send the result. Sending stays a separate approval." },
    ],
    compareIntro: "Letting a model loose on a laptop, hiring someone to run the sheet, and a fenced task are different risks.",
    rows: [
      { label: "What it can touch", shelf: "Whatever the plugin or the laptop can touch.", hire: "Whatever that person can open.", us: "The files and the actions on the list, for the time you set." },
      { label: "When it fails", shelf: "You may not notice until later.", hire: "They notice if they are looking.", us: "The run stops and the reason is in the log." },
      { label: "Who sends the result", shelf: "Sometimes the tool does, if the toggle was on.", hire: "The person, if you trust them to.", us: "A person, unless you explicitly approved a send." },
      { label: "When off the shelf wins", shelf: "The assistant only needs to talk, or the task is one formula in a sheet a person already opens. Do not put a code runner behind a conversation that never needed one.", hire: "A person running a weekly sheet by hand is fine when the sheet is small and the stakes of a miss are low.", us: "We will leave this out of the assistant when the job is conversation only. The fence earns its place when a task is repeated and a wrong write would be expensive." },
    ],
    proofs: [
      {
        title: "It ships inside the assistant",
        text: "There is no separate client story for a code runner, and we will not invent one. The public shape is the assistant that answers and files the request. This page is the limit on the job that runs.",
        href: "/services/ai-assistants-and-agents/",
        link: "Read the assistant page",
      },
    ],
    faqs: [
      ["Is this a server we rent and forget?", "No. It is a task the assistant runs, with a limit, on Cloudflare. You do not get an open machine and a password."],
      ["Can it install whatever package it wants?", "No. Dependencies are the ones you approved. A request to fetch something new stops."],
      ["Can it reach our production records?", "Only the read or write you named. A wide credential is a failed brief. We would rather the task be unable to see a table than able to see all of them."],
      ["What if the model writes bad code?", "The task still runs inside the limit, and the result is not sent until the approval you set. A crash is a log line, not a change to the record."],
      ["Do we have to read code?", "You have to read the task in plain language: what it may open, what it may write, and when it must stop. The code is ours to maintain. The permission is yours."],
      ["Can we buy this without an assistant?", "The page stays up so the limit is easy to find. The thing we ship is the assistant with this capability turned on for the tasks you listed. If there is no assistant, there is nothing to fence."],
    ],
    close: "Name one task a person copies out of a thread and runs by hand. We will show the fence around it, and whether it belongs in the assistant at all.",
  }),
  "custom-apps": page({
    short: "Custom apps",
    title: "A screen that follows your order",
    headline: "A screen that follows the order your team already uses.",
    description: "A screen that follows the order your team already uses, instead of a generic app you work around.",
    dek: "The work has an order. The tools you rented were built for a different order, so the team keeps a side sheet where the real job happens. We build the screen around the job you already do.",
    strip: [
      { href: "/portfolio/superpatch-products/", label: "SuperPatch products" },
      { href: "/portfolio/strongfoam-website/", label: "StrongFoam website" },
      { href: "/portfolio/strongfoam-crm/", label: "StrongFoam CRM/ERP" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
      { href: "/portfolio/pirx/", label: "pirx.ca" },
    ],
    problemTitle: "The real job lives in a side sheet",
    problem: [
      "The rented app has the right nouns and the wrong order. People export, fix the row in a sheet, and import, or they keep the sheet and let the app go stale. A new hire learns the sheet, not the product you pay for. The record of the business is whichever file was saved last.",
      "Buying another module adds a login. Hiring a developer without a written job adds a queue. The missing piece is usually small and specific: the estimate, the booking, the record the team actually trusts, the public page a buyer reads before they ask.",
    ],
    outcomes: [
      { title: "A screen in the real order", text: "The first thing the team does in the morning is the first thing on the screen. Extra fields that nobody uses are not there." },
      { title: "One record", text: "The customer, the job, and the number live in one place. A side sheet is a sign the app is not done." },
      { title: "A public page when the job needs one", text: "If a buyer or a caller has to understand the offer before they talk to you, that page is part of the app, not a separate project that drifts." },
      { title: "An exit", text: "You can export the record. We do not keep it in a format you cannot leave." },
    ],
    uses: [
      { title: "The record the team works in", text: "Customers, jobs, and the numbers, in the order the day actually happens. People stop reconciling two tools at the end of the week." },
      { title: "A request that should become work", text: "An estimate, a booking, or a form on the public site lands in the record. Nobody retypes it to make it real." },
      { title: "A page a buyer can finish", text: "The offer, the comparison, and the questions are on the page. The buyer shows up having read them, and the team is not repeating the same explanation." },
    ],
    compareIntro: "A rented suite, a developer you hire, and an app built around one job solve different problems.",
    rows: [
      { label: "Fit", shelf: "The product's order. You adapt.", hire: "Whatever the person has time to finish.", us: "The order you already trust, written down before we build." },
      { label: "What you maintain", shelf: "The vendor's updates, and the side sheet.", hire: "The person, the code, and the handover.", us: "The rules and the content. We run the build on Cloudflare." },
      { label: "When it is wrong", shelf: "You wait on a roadmap or you workaround.", hire: "You wait on one person's queue.", us: "We change the screen and your team tries it on last week's work." },
      { label: "When off the shelf wins", shelf: "A spreadsheet the team likes already does the job, or a rented app matches the order and people actually use it. Keep it. A custom app for a job the sheet does well is a hobby.", hire: "A full-time hire makes sense when you have a continuous stream of product changes and someone to manage them. One screen is not that job.", us: "We will tell you to keep the sheet or the suite. We build when the side system has become the real one." },
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
        text: "A public site where a visitor can start an estimate and book, so the request is not retyped.",
        href: "/portfolio/strongfoam-website/",
        link: "StrongFoam website",
      },
      {
        title: "StrongFoam CRM/ERP",
        text: "The record the team works in: the customer, the job, and the numbers, in one place.",
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
        text: "The app, and the blogs beside it. The search figures for the blogs are on the portfolio note and on the AI visibility page. They are not repeated as a claim about every app.",
        href: "/portfolio/pirx/",
        link: "pirx.ca",
        shots: pirxCustomAppShots,
      },
    ],
    faqs: [
      ["Do we have to throw away the tools we already pay for?", "No. We replace the pile that is actually in the way. A tool people already like can stay, and we will say which is which in the brief."],
      ["Can the current staff use it without a course?", "The first version is the path they already walk. If a screen needs a manual, it is not done."],
      ["Who owns the data?", "You do. We can export it. We do not lock the record to a format you cannot leave."],
      ["How do we know it matches the job?", "Your team runs last week's real work through it before it is the system of record. A demo with sample rows is not approval."],
      ["Will you rebuild every department?", "No. One job, end to end. A second job is a second brief."],
      ["What does it cost?", "Contact for pricing. We price the job after the brief, not from a public rate card. There is no seat price on this page."],
    ],
    close: "Walk us through the side sheet the team actually trusts. If that sheet is the product, we will show the screen that replaces it. If the rented app is fine, we will say that too.",
  }),
  "ai-media": page({
    short: "AI media",
    title: "Drafts you check before they go out",
    headline: "Draft the picture, the clip, or the transcript. You decide what goes out.",
    description: "Draft the picture, the clip, or the transcript from material you already have. You decide what goes out.",
    dek: "The page needs a picture, the recording needs a transcript, the post needs a clip. A model can draft those. A person still decides what is allowed to leave the building.",
    strip: [
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "The draft is late, so the page goes out bare",
    problem: [
      "A page, a post, or a follow-up needs an image or a short clip, and the person who makes them is on something else. The page ships with a gray box, or it waits. Recordings pile up because nobody has time to write down what was said. The words the business already approved never make it onto the asset.",
      "A generated picture that ignores the brief is worse than no picture. Wrong claims, wrong labels, a face you do not have the right to use. Speed without an approval step publishes the mistake.",
    ],
    outcomes: [
      { title: "A draft from your inputs", text: "The image, the transcript, or the clip starts from the brief, the file, or the footage you supplied. It does not start from a guess about your brand." },
      { title: "Words you can check", text: "Short labels are read by a person before they are public. A line that must be exact is set as text, not left to the picture to spell." },
      { title: "A yes before it is public", text: "Nothing is posted, mailed, or placed on a page until a person you name approves that file." },
      { title: "The file, where the team can use it", text: "The approved asset is stored with the record of which draft you picked, in a format the site or the post can use." },
    ],
    uses: [
      { title: "A picture for a page you are about to publish", text: "You describe the shot and the words that must appear. You get drafts. You pick one, or you reject the set. The page does not invent its own." },
      { title: "A transcript of a recording the team needs to read", text: "The recording stays the source. The transcript is a reading copy a person can correct before anyone quotes it." },
      { title: "A short clip from footage you already shot", text: "The cut uses your footage and the line you supplied. It is not a new scene starring people you did not film." },
    ],
    compareIntro: "A template library, a designer or editor you hire, and a draft-then-approve path fit different volumes.",
    rows: [
      { label: "Where the asset starts", shelf: "A stock frame or a one-click generator.", hire: "A person's time, from a blank page.", us: "Your brief, your file, or your footage." },
      { label: "Who may publish", shelf: "Whoever exports, unless you lock the tool.", hire: "The person, if they remember the rule.", us: "The approver you named. The draft cannot post itself." },
      { label: "When the words matter", shelf: "The picture often misspells them.", hire: "They set the type by hand.", us: "Exact lines are set as text and checked. The picture is not trusted to spell." },
      { label: "When off the shelf wins", shelf: "You publish rarely, a person already makes the asset by hand, and a stock image is honest about being stock. Keep that. Also keep a designer when the piece is a flagship and the draft would waste their time rather than start it.", hire: "A hire is the right call for a steady stream of original work that must be invented, not drafted.", us: "We fit when the volume is higher than the team can draft and a person is still willing to approve every public file." },
    ],
    proofs: [
      {
        title: "Renew Implants",
        text: "Renew Implants includes the social posts and the blogs beside the website. The posts are the public media. A person approved what went out. We do not add a metric or a quote on this page.",
        href: "/portfolio/renew-implants/",
        link: "Read the Renew Implants note",
      },
    ],
    faqs: [
      ["Will you publish a picture of a customer?", "No, unless you give us that photo and the right to use it. Drafts start from your prompt, your file, or your footage."],
      ["Are the files ours to use?", "You get the file we made for the use we agreed. We do not resell it and we do not drop it into another client's work."],
      ["Can the text inside an image be trusted?", "No, not by default. A person checks short labels. If a line must be exact, we set it as text on the page."],
      ["Do transcripts replace the recording?", "They are a reading copy. If the words matter, the recording stays the source and the transcript is corrected against it."],
      ["Can it match a face from a photo we found online?", "No. We do not build a person's likeness from a picture you do not have rights to."],
      ["What if we hate the whole set?", "Then nothing ships. Rejection is a normal outcome of the approval step, not a failed project."],
    ],
    close: "Send the brief for one asset you needed last week and did not have. We will show the draft, the line a person must check, and the approval that has to happen before it is public.",
  }),
  "ai-visibility": page({
    short: "AI visibility",
    title: "See who is reading the site",
    headline: "See who is reading the site, and point them at the right pages.",
    description: "See which answer engines read the site, and point them at the pages you want quoted.",
    dek: "People ask a question and get an answer without opening your site. You can still decide which pages are worth quoting, and you can see which crawlers actually came.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca" },
      { href: "/portfolio/renew-implants/", label: "Renew Implants" },
    ],
    problemTitle: "An answer engine is describing you from the wrong page",
    problem: [
      "A buyer asks a question you have already answered in public. The reply they see names you, or it names someone else, or it quotes a page you retired. You cannot fix that by shouting at the model. You can fix what you publish, which pages you ask to be read, and which crawlers you refuse.",
      "Most teams do not know who fetched the site last week. A block aimed at the wrong crawler can hide you from search. A wide-open site can hand a private page to a training run. The work is specific: the note, the allow list, the block list, and a page that deserves to be quoted.",
    ],
    outcomes: [
      { title: "A note in your words", text: "A plain file tells a reader, human or crawler, what you do and which pages are the ones to cite. It does not invent a claim." },
      { title: "A say in who crawls", text: "You can allow a search crawler and refuse a training crawler. We name which is which before anything is blocked." },
      { title: "A page worth quoting", text: "The public page answers a real question in language you will stand behind. That is what an answer engine has to work with." },
      { title: "A record of who came", text: "You can see which crawlers fetched the site. The report is something you can re-read, not a dashboard you have to trust on faith." },
    ],
    uses: [
      { title: "A public page you want quoted", text: "You choose the page that answers the question buyers already ask. The note points at it. Old pages that contradict it are not left in the way." },
      { title: "A private page that should stay quiet", text: "A draft, a login, or an internal note is left out of the file and, where it matters, blocked. Public and private are different decisions." },
      { title: "A weekly look at who fetched the site", text: "You see the crawlers that came. A surprise visitor is a decision, not a mystery you discover months later." },
    ],
    compareIntro: "An SEO retainer, a hire, and a visibility system promise very different things. None of them can force a model to mention you.",
    rows: [
      { label: "What is actually delivered", shelf: "A tool's score, or a monthly rank report.", hire: "Pages, if the person also writes.", us: "The note, the crawler rules, and pages you will stand behind." },
      { label: "What it cannot do", shelf: "Guarantee a mention.", hire: "Guarantee a mention.", us: "Guarantee a mention. We do not sell that." },
      { label: "What you can see", shelf: "The vendor's chart.", hire: "Whatever they choose to report.", us: "Who crawled, what the note says, and which pages it points at." },
      { label: "When off the shelf wins", shelf: "The site is new, it has almost no public pages, and you are not ready for a crawler to quote you. Do not invite that. Publish the page first. A tracker you bought will not invent a page worth citing.", hire: "A writer on staff is the right hire when the missing piece is the article itself and you already know which question it answers.", us: "We fit when the pages exist, or we are writing them with you, and you want a deliberate say in what gets read." },
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
        text: "The Renew Implants blogs are the public pages beside the website and the social posts. They are named here as writing a person can read. We do not attach a search figure to them.",
        href: "/portfolio/renew-implants/",
        link: "Read the Renew Implants note",
      },
    ],
    faqs: [
      ["Does this guarantee we show up in answers?", "No. It makes the page worth quoting and tells crawlers what you want them to read. Being mentioned still depends on the engine."],
      ["Will a block hurt search?", "A block aimed at a training crawler is a different switch from a search crawler. We name which is which before anything is blocked. If we cannot tell them apart, we do not block."],
      ["What is the plain-text note?", "A file on the site that introduces the business and lists the pages worth reading. People can read it too. We do not hide claims there that are not on the site."],
      ["Do we need new pages?", "Only if the current ones do not answer the question. We do not publish filler to chase a crawler."],
      ["Can you use another client's numbers on our site?", "No. The pirx.ca figures stay attached to pirx.ca and to the date they were pulled. Your report will be yours."],
      ["How often do the figures move?", "The number on this page is the Google Search Console window Jul 14 to Oct 13, 2026. We do not refresh it from memory."],
    ],
    close: "Show us the question buyers already ask and the page you wish was quoted. We will say whether the page is ready, and what we would tell a crawler to read.",
  }),
  "search-grounded-research": page({
    short: "Search-grounded research",
    title: "A brief with the links under it",
    headline: "A research brief with the links under it, so you can check.",
    description: "A research brief with the links under each claim, so you can open the page and check.",
    dek: "A question your files do not cover still needs an answer you can check. The brief comes with the links underneath the claims. If there is no page, there is no answer.",
    strip: [
      { href: "/portfolio/pirx/", label: "pirx.ca blogs" },
    ],
    problemTitle: "The summary arrives without a source",
    problem: [
      "Someone pastes a paragraph before a decision. It sounds current. It has no link. The person who has to own the decision either trusts it or spends an hour opening tabs to see whether it is real. Both are bad. Trusting it is how a stale page becomes company fact. Rechecking it by hand is the job the tool was supposed to do.",
      "A chatbot will still answer when it did not open a page. That is the wrong product for a question that has to be current. Your own documents are the wrong pile too, when the fact lives outside the company.",
    ],
    outcomes: [
      { title: "The links stay attached", text: "A claim you are meant to trust carries a page. You can open it. A sentence with no page is not a finding." },
      { title: "A refusal when the web is thin", text: "If the search does not support the answer, the brief says so. It does not smooth the gap into a paragraph." },
      { title: "Public pages only", text: "It reads what a stranger could open. A page behind a login is out of scope, on purpose." },
      { title: "A brief you can keep", text: "You can save the one you want. The saved copy still has the links. It is a start, not a source." },
    ],
    uses: [
      { title: "A claim checked against this month", text: "You ask whether a public statement is still true. The brief shows the pages, including one that contradicts it if that page exists." },
      { title: "A short brief before a meeting", text: "The question is specific. The reply is short, with the links under it, so the room can open the one that matters." },
      { title: "Two public sources, side by side", text: "You ask for the disagreement, not a blend. The brief keeps the two pages apart and says where they differ." },
    ],
    compareIntro: "A chatbot, a researcher you hire, and a sourced brief are different levels of trust.",
    rows: [
      { label: "What you can check", shelf: "Often nothing. The paragraph is the product.", hire: "Their notes, if they keep them.", us: "The page under the claim." },
      { label: "When the source is missing", shelf: "You may still get a fluent answer.", hire: "They say they could not find it, or they fill in.", us: "The brief says it could not find a page." },
      { label: "What it will not read", shelf: "Depends on the product, and is easy to forget.", hire: "Whatever they can log into.", us: "Public pages only. Private files belong in document search." },
      { label: "When off the shelf wins", shelf: "The question is already answered in your own files, or you need a casual explanation and nobody will act on it. Use the files, or use a normal chat. A sourced brief is the wrong weight for a curiosity.", hire: "Hire a researcher when the question needs interviews, judgment, or access you cannot put on the public web.", us: "We fit when the facts are public, the decision is real, and an unsourced paragraph would be dangerous." },
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
      ["Will it cite a page it did not open?", "No. Every claim you are meant to trust carries a link you can open. A remembered citation is not good enough."],
      ["Is the brief advice?", "It is a reading list with a summary. The decision stays with you. We do not dress a source list up as a recommendation to buy, sue, or treat."],
      ["How current is it?", "As current as the pages it opened for that run. A saved brief is frozen on that day. Ask again if the week matters."],
      ["Can this replace someone who knows the field?", "No. It shortens the reading. A person who knows the field still decides what the pages mean."],
    ],
    close: "Bring a question you would otherwise paste into a chat before a decision. We will show the brief with the links, or we will show you the refusal.",
  }),
};
