---
title: "AI Agents for Business: When to Use One"
description: "Eight jobs can sit with an agent only when a person still checks the output. Anthropic says to start simpler. Gartner expects many agent projects to be canceled."
datePublished: "2026-10-14"
dateModified: "2026-10-14"
pillar: "AI agents"
cluster: "agents"
primaryQuery: "ai agents for business"
author: christopher-buzny
cta: "An agent without an owner is a risk. Score the people side."
images:
  - src: /blog/media/ai-agents-for-business/01.png
    file: ai-agents-for-business-01.jpg
    alt: "Eight job trays in a row, each with its own stop button, the business jobs an agent may run only until a person stops it"
    caption: "Eight jobs. Each one has a stop."
    prompt: "Editorial still-life, charcoal desk, near-black background, coral and cyan rim light. Exactly eight small trays in a row. Each tray holds a different object: envelopes, a notepad, a quote page, an invoice, a carton, a headset, a clock, a report booklet. Each tray has a round stop button in front. No people, no logos, wide 16:9."
  - src: /blog/media/ai-agents-for-business/02.png
    file: ai-agents-for-business-02.jpg
    alt: "The same eight job trays each waiting under an approval stamp, the comparison of what the person still does"
    caption: "The person still approves the step that matters."
    prompt: "Editorial still-life, charcoal desk, near-black background, coral and cyan rim light. Eight small trays recede in a line, each with a rubber approval stamp resting on its rim, unused. No people, no logos, wide 16:9."
  - src: /blog/media/ai-agents-for-business/03.png
    file: ai-agents-for-business-03.jpg
    alt: "Four small desk robots, each with a stop button in front of a stack of job papers, an agent job held until a person decides"
    caption: "One job done. Seven still waiting on a person."
    prompt: "Editorial still-life, charcoal desk, near-black background, coral and cyan rim light. The nearest of eight trays is stamped and lit. The other seven trays sit in a dark queue behind it. No people, no logos, wide 16:9."
faqs:
  - question: "When should a business use an agent instead of a workflow?"
    answer: "When the next step depends on what the last step found, and you cannot write every branch in advance. Anthropic says to start with the simplest system that works."
  - question: "What belongs in the human checkpoint?"
    answer: "A named person, a place where the output waits, and a rule for what happens if it is wrong. A checkpoint that nobody owns is not a checkpoint."
  - question: "Why are so many agent projects expected to stop?"
    answer: "Gartner said over 40% of agentic AI projects will be canceled by the end of 2027, because of cost, unclear value, or inadequate risk controls."
citations:
  - id: anthropic
    title: "Building effective agents"
    url: "https://www.anthropic.com/research/building-effective-agents"
    publisher: "Anthropic"
    datePublished: "2024-12-19"
    figures: ["2024"]
  - id: gartner-agentic
    title: "Over 40 percent of agentic AI projects will be canceled by end of 2027"
    url: "https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027"
    publisher: "Gartner"
    datePublished: "2025-06-25"
    figures: ["2025", "40", "2027", "3412", "19", "42", "8", "31", "130", "15", "2028", "0", "2024", "33", "1"]
---
An agent earns a place in the business only when the job branches and a person still checks the output. If the steps don't change, write the workflow and stop. Anthropic's December 2024 essay says to start with the simplest solution, and it separates a fixed workflow from an agent that directs its own tools.[^anthropic] We like that split because vendors have spent a year sanding it down. Everything is called an agent now, including a reminder that fires the same way every time. A reminder is a workflow. An agent is what you need when the next step depends on what the last step found, and you can't write every branch in advance. Even then, a person owns the stop. An agent without that person is a risk with a nickname.

The [people guide](https://check.abra-ca-dabra.app/check/guide/fix/ready-people-low) is the matching fix when the gap is who checks, not which model you rent. The [definition](/blog/what-is-an-ai-agent) is the vocabulary, if the word itself has started to slide around the table. The [agentic comparison](/blog/ai-agents-vs-agentic-ai) is the next distinction, for when someone wants a fancier noun than the job deserves. Most owners we sit with don't need the fancier noun. They need one job held until a named person says it can leave.

## Eight jobs, each with a stop

Inbox triage waits for a person before anything is sent. Meeting notes wait before they become tasks. Quote follow-up waits before a price goes out. Invoice questions wait before a payment promise. Inventory exceptions wait before a purchase. Support replies wait before they reach the customer. Schedule changes wait before a customer is told. A weekly report waits before it is treated as the record.

Those eight are the only list we'd start from. Each one already happens in a shop, a clinic, or a trades desk. Each one has a moment where a wrong move is felt by a customer or by the books. The agent, if you use one, prepares. The person in the right-hand column decides. If you can't point at that person on a Tuesday, you don't have a candidate. You have a demo.

<!--image:2-->

| Job | What the person still does |
| --- | --- |
| Inbox triage | Decides what is actually sent |
| Meeting notes | Accepts the tasks |
| Quote follow-up | Approves the price |
| Invoice questions | Approves any promise to pay |
| Inventory exceptions | Approves the order |
| Support replies | Approves what the customer sees |
| Schedule changes | Approves the message |
| Weekly report | Accepts it as the record |

<!--cta:inline-->

Gartner said in June 2025 that over 40% of agentic AI projects will be canceled by the end of 2027.[^gartner-agentic] The reasons are cost, unclear value, and inadequate risk controls. A job from the list above without a named checker is a candidate for that pile. Cost shows up when the agent keeps being allowed to look at more systems because nobody set the edge. Unclear value shows up when you can't say which wait in the list got shorter. Inadequate risk controls show up when the output doesn't wait. Cancellation isn't a moral. It's what happens to projects that were nouns before they were jobs. We'd rather you never start than join that pile with a good story about the pilot.

<!--image:3-->

## A worked example

Take a clinic schedule as the case where an agent can be honest. This is a walkthrough. The front desk owns the book. The practitioner owns which visits are in scope. A patient asks to move a Tuesday visit to later in the week. Whether that works depends on what the book shows, on whether that practitioner does that kind of visit, and on a note billing will eventually need. You can't write every branch on a card. Someone has to look. An agent can look, draft the reply, and wait. The front desk still approves the message, because some patients need a call and some need two sentences, and the draft doesn't know the family. If the move changes the clinical plan, the practitioner approves it. That's the branch. The stop is a name, not a toggle labeled human in the loop that nobody's job description mentions.

Now take the shop's weekly report, which people love to call an agent because the word sounds busy. The report is the same shape every time. Yesterday's sales, the items that ran low, the invoices still open. Nothing in it depends on a discovery that rewrites the next step. A workflow can assemble it. A person accepts it as the record, or they don't and it stays a draft. Buying an agent for that assembly is how you pay for judgment you didn't need and skip the judgment you did. The acceptance is the whole point of the row in the table. If the bookkeeper doesn't accept the numbers, the report is a rumor that happens to be formatted.

A trades desk shows both shapes in one afternoon. Quote follow-up branches when the customer asks a question that changes the price path. The agent can gather the prior note and draft a reply. The owner approves the price before anything goes out. Invoice questions are stricter. A promise to pay is never the agent's to make. The person approves any promise. Inventory exceptions wait before a purchase, because ordering the wrong part is a truck roll. Support replies wait before the customer sees them. Schedule changes wait before a customer is told the van is coming. Meeting notes wait before they become tasks the lead tech didn't agree to. Inbox triage waits before anything is sent, including the cheerful draft that would have gone to the wrong thread. None of these require a new department. They require the wait to be real. A wait that is "usually someone glances" is not a wait. It's a wish.

## How we'd run it

First, write the job as if it were a plain workflow. Who starts it. What they produce. Who receives it. If you can finish that page without a branch, stop and ship the workflow. Anthropic's advice to start simpler is the whole method. The agent is the exception you earn, not the default you announce.

Second, circle the step where the next action depends on what you found. On the clinic book, the next message depends on the open slots and on whether the visit is in scope. On quote follow-up, the next sentence depends on whether the customer's question changed the job. If you can't circle a step like that, you circled a feeling. Feelings don't get a project.

Third, if you circled one, name the person who approves, using the table as the floor not the ceiling. Schedule changes: someone approves the message. Invoice questions: someone approves any promise to pay. Write the name of the human who works your desk, not the role "operations." If that person is "whoever is free," you have already described the cancellation. Free people don't check. Named people do, on their grouchiest morning.

Fourth, define the wrongness before you turn anything on. A moved visit on the wrong day. A price the owner never said. A payment promise the bookkeeper wouldn't make. A report treated as the books when it was still a draft. The risk control is that sentence plus a place where the output sits until the sentence is satisfied. Gartner's reasons aren't abstract here. Inadequate risk controls are a send button with no waiting room.

Fifth, run one job from the list and leave the others waiting on a person in the old way. Inbox triage or schedule changes are enough. Don't light up quote follow-up, support replies, and the weekly report in the same breath. One branch, one checker, one week of real messages. If the checker starts bypassing the wait because the draft is "usually fine," you learned something bad. Usually fine is how the wrong one leaves the building.

Sixth, revisit only after the first job is dull. Dull means the person still checks, the branch still matters, and you can say what value showed up without inventing a chart. If you can't, turn it off before cost becomes the reason someone else turns it off for you. Ending a small experiment is a success. Feeding it until the end of a hype cycle is how that canceled pile gets its next member.

## Common mistakes

Calling every automation an agent is the mistake the vocabulary notes exist to stop. A fixed sequence that files a photo and waits for a price is a workflow. It can be excellent. It doesn't get better because you rename it. We've watched owners pay an agent premium for a checklist, then feel cheated when the checklist behaved like a checklist. It was honest. The brochure wasn't.

Letting the output send itself is the mistake that reaches a customer. The table is blunt on purpose. Someone decides what is actually sent. Someone approves what the customer sees. Someone approves the message about a schedule change. Remove those sentences and you have a confident drafter with the keys. Confidence isn't authorization. The front desk's knowledge of who needs a phone call will not be in the prompt you wrote on a calm afternoon.

Starting from the model instead of the branch is how pilots get expensive and vague. Someone wants "an agent for the business" the way they might want a new hire with no seat. There is no seat called the business. There is inbox triage, or there isn't. There is a weekly report someone must accept, or there is a PDF that will be quoted as fact. Pick the row. If none of the rows hurt this month, you don't have an agent project. You have curiosity. Curiosity can read the definition post. It shouldn't sign a platform agreement.

Ignoring the cancellation forecast because it sounds like someone else's enterprise problem is how small firms get a smaller version of the same ending. Over 40% is not a large-company-only weather report. Cost, unclear value, and inadequate risk controls fit a clinic and a trades desk perfectly well. Your version won't make the newspaper. It will make a monthly bill and a queue of drafts nobody trusts. That's an adequate disaster. You don't need a bigger one to take the warning.

Staffing the check with a committee is the polite version of having no checker. "The team will review" means the draft sits until it doesn't. Write one name. Give that person the authority to say no without a meeting. If the job is important enough for an agent, it's important enough for a name. If it isn't important enough for a name, it isn't important enough for an agent.

## What we'd do

We'd start with a workflow and make the agent earn the exception. That's the opinion, and we hold it when the demo is charming. Charming is not a branch. A branch is a schedule that changes what you're allowed to say, or a customer question that changes a price. If we can't see that on a real job from last week, we ship the fixed path and we go home. Home is a good outcome. Not every visit should end with a new system.

We'd put the person's name in the checkpoint before anything is turned on, and we'd use the table as a contract. The person decides what is sent, accepts the tasks, approves the price, approves any promise to pay, approves the order, approves what the customer sees, approves the message, and accepts the report as the record. If a proposal won't attach a name to the row you picked, the proposal is the risk control failure showing up early. Believe it.

We wouldn't run the whole list to feel modern. One job, held at the stop, beats eight half-starts that will be canceled for the reasons Gartner already gave. If you want a test this week, pick schedule changes or inbox triage, write the name of the approver, and refuse every extra system until that approver has lived with the wait. The agent can be added when the wait is real. It doesn't get to create the wait by existing.
