---
title: "What Is an AI Agent? A Plain Answer for Owners"
description: "An agent picks its own next step. A workflow follows a path you wrote. This note uses Anthropic's distinction and McKinsey's survey of who is scaling."
datePublished: "2026-10-14"
dateModified: "2026-10-14"
pillar: "AI agents"
cluster: "agents"
primaryQuery: "what is an ai agent"
author: christopher-buzny
cta: "An agent needs a written process and an owner. Score both."
images:
  - src: /blog/media/what-is-an-ai-agent/01.webp
    file: what-is-an-ai-agent-01.jpg
    alt: "A person at a service counter with a laptop and a notepad, seen from the side so the face stays out of view"
    caption: "The counter, with a notepad beside the laptop."
    prompt: "Editorial illustration, no photographs of people and no readable words. Near-black canvas, coral rim light, pale cyan fill. Hero image for the note “What Is an AI Agent? A Plain-Language Answer for Business Owners”: one central object that carries the idea, wide 16:9 framing."
  - src: /blog/media/what-is-an-ai-agent/02.png
    file: what-is-an-ai-agent-02.jpg
    alt: "Two separate tracks, one fixed and one branching, on a dark field"
    caption: "A workflow stays on the path you wrote."
    prompt: "Editorial illustration, no photographs of people and no readable words. Near-black canvas. In-body comparison for “What Is an AI Agent? A Plain-Language Answer for Business Owners”: two or three abstract forms held apart so the difference is visible, wide 16:9 framing."
  - src: /blog/media/what-is-an-ai-agent/03.png
    file: what-is-an-ai-agent-03.jpg
    alt: "A small cyan gate at the end of a path, standing for a human checkpoint"
    caption: "Someone still owns the stop."
    prompt: "Editorial illustration, no photographs of people and no readable words. Near-black canvas. Closing image for “What Is an AI Agent? A Plain-Language Answer for Business Owners”: a small row of objects that suggests the next action, wide 16:9 framing."
faqs:
  - question: "What is an AI agent in plain language?"
    answer: "Anthropic describes an agent as a system where the model directs its own process and tool use. A workflow, by contrast, follows a path the builder wrote in advance."
  - question: "Should a small business start with an agent?"
    answer: "Anthropic's December 2024 essay says to start with the simplest solution that works. A fixed workflow is enough when the steps do not change."
  - question: "How many firms are scaling agents?"
    answer: "McKinsey's 2025 survey says 23% of respondents are scaling an agentic system somewhere in the enterprise, and 39% are experimenting. In any one function, no more than 10% say they are scaling agents."
citations:
  - id: anthropic
    title: "Building effective agents"
    url: "https://www.anthropic.com/research/building-effective-agents"
    publisher: "Anthropic"
    datePublished: "2024-12-19"
    figures: ["2024"]
  - id: mckinsey
    title: "The state of AI in 2025: Agents, innovation, and transformation"
    url: "https://www.mckinsey.com/~/media/mckinsey/business%20functions/quantumblack/our%20insights/the%20state%20of%20ai/november%202025/the-state-of-ai-2025-agents-innovation_cmyk-v1.pdf"
    publisher: "McKinsey"
    figures: ["2025", "88", "78", "23", "39", "10", "29", "100", "5"]
---
An AI agent chooses its own next step inside bounds you set. A workflow does the steps in an order you already wrote. We use that split every time an owner asks whether the new line on the invoice is an agent or a form with a louder name.

Anthropic's December 2024 essay draws the line in those terms. A workflow runs large language models and tools on a path the builder defined, and an agent lets the model direct its own process and its own tool use.[^anthropic] The essay also says to start with the simplest solution, and to add complexity only when the simpler system fails. We keep that sentence on the table during these conversations. Most of the businesses we sit with are not stuck because the software is too plain. They are stuck because the work still lives in one person's memory, and a vendor asked a model to invent a process nobody had written down.

If those steps are still in someone's head, the matching check is the [process guide](https://check.abra-ca-dabra.app/check/guide/fix/ready-process-low). The [use-case note](/blog/ai-agents-for-business) lists jobs a system might take. The [comparison note](/blog/ai-agents-vs-agentic-ai) stays on the vocabulary, which is where sales pages get slippery.

## When a workflow is enough

Use a workflow when the steps are known: take the email, extract the fields, write the draft, wait for a person. Use an agent when the next step depends on what the last step found, and you cannot write every branch in advance. If you cannot name the stop condition, you do not have either one yet.

Picture a plumbing desk on a loud Monday. Dana runs the book. She gets the name, the address, and whether water is on the floor. She asks which room, and whether anyone shut the main off. Those questions do not change because a model showed up. A workflow can hold them: a form, a text to the on-call tech, a line in the book. The fork comes after intake, and that is the part people try to skip.

A restaurant with water through the ceiling is a different promise from a slow drip under a rental sink. The restaurant needs the owner or the senior tech to say whether someone rolls now. The drip can wait for the afternoon route. Vendors offer an agent for that fork. The model would read the note and pick a tech, a part, and a time. We would let it draft the options. We would not let it text a time until Dana or the owner has looked. Known order, workflow. Order that depends on what you just learned, maybe an agent, and still a person who can stop the send.

<!--image:2-->

| Kind of system | Who picks the next step | When it fits |
| --- | --- | --- |
| One prompt | The person at the keyboard | A single draft or a single answer |
| Workflow | The path you wrote | The steps rarely change |
| Agent | The model, inside bounds you set | The path depends on what it finds |

Read the middle column before you read a product page. One prompt means the person at the keyboard is still choosing. They paste the job notes, ask for a reply, and send it themselves. That can save a tired afternoon. It is not an agent, and it does not need to become one. A workflow means you already know the order, and the software repeats it without getting bored or skipping the address. An agent means the model looks at what it just found and chooses a tool. The calendar, the parts list, the text message. The bounds are yours. You decide which tools exist, what the system is forbidden to send, and who holds the stop.

The right-hand column is the test we use with owners. If the steps rarely change, stop shopping and write the path. If the path depends on what the system finds, you may want an agent, and you still want the bounds on one page a new hire could follow. We have watched shops buy the agent column for work that belongs in the first row. The staff then spends the week correcting a machine that was never supposed to decide.

## What the survey actually counts

Owners hear a loud number and assume the trade has already moved past them. McKinsey's 2025 survey says 88% of respondents report regular AI use in at least one business function, compared with 78% a year earlier.[^mckinsey] That is a wide claim. Regular use can be a person pasting a quote into a chat window on a Thursday. It is a different sentence from "we run an agent."

The agent sentences are smaller, and they are the ones we want in the room. 23% say their organizations are scaling an agentic system somewhere in the enterprise. An additional 39% are experimenting with agents. In any one function, no more than 10% say they are scaling agents. Read that last line slowly. Somewhere in a large company is a different fact from "the scheduling desk has an agent in production." Firms under $100 million in revenue are less often at the scaling stage: 29%, against nearly half of firms over $5 billion.

<!--cta:inline-->

Those are enterprise survey shares. They are not a score for one small business. An agent still needs a written process and a person who can stop it.

We say this out loud because the wide percentage gets used as a shove. A vendor will put the 88% line on a slide and talk as if a shop with a few trucks is late. The survey does not say that. It says use is common, and scaling an agent inside a single function is not. If firms with real operations teams are mostly still experimenting, you are allowed to write your process before you buy a system that chooses its own tools. The survey is a count of what respondents said. It is not a definition of an agent, and it is not a grade for your desk. Wooden bars of different heights do not tell Dana what to do with the next call.

<!--image:3-->

## A worked example

Stay with the plumbing desk and give everyone a job. This is a walk-through, not a result we measured. Chris owns the company and takes the hard calls. Dana runs the book. Luis and Priya are on the tools.

A property manager calls about a smell in more than one unit. Dana opens the job the way she always has. Name, callback number, address, keys, whether anyone is home. That block is a workflow. It should not depend on a model's mood. The note that comes back is messy. One unit had a dishwasher replaced recently. Another has a tenant who shuts the water off and tells nobody. Another unit is vacant. The next step depends on what Dana just heard. Which door gets the first visit. Whether the truck should carry a camera. Whether a vacant unit with a smell is a bigger opening than a clogged trap.

An agent, in the sense of that 2024 essay, could read the note, look at the afternoon routes and the parts list, and propose an order. Vacant unit first, camera on the truck, Luis because he did the camera work last week and Priya is already on a job across town. The proposal is the agent's work. The text to the manager is not, until Dana accepts the wording and the time. If the model cannot see the route, it should say so and stop, rather than invent an arrival window. The card by the phone says no time goes out unless a person on the desk has tapped yes.

A workflow ends at the form, which is the right ending for intake and the wrong tool for this fork. You cannot pre-write every branch of a messy multi-unit call. A single prompt would be Dana pasting the note into a chat box and asking for a polite reply. Fine on a quiet afternoon. It does not watch the route, and it does not send anything.

Chris does not need a lecture on models. He needs to know which decisions the desk may delegate. Dana needs propose and send as different buttons. Luis needs the camera on the truck if the camera was the point. If those people cannot point at the control that stops the system, you do not have an agent yet. You have a chatbot wearing a job title, and the customer will hear its mistakes in your voice.

## How we'd run it

We would not start by picking software. We would sit with Dana and write what she already does when the phone is mean.

First, name the job in one sentence a new hire could repeat. "Turn a call into a visit the tech can finish, without promising a time the route cannot keep." If that sentence becomes the whole menu, you have not named the job.

Second, write the steps that do not change. Name, number, address, access, what is happening, who is rolling. Use Dana's order, not a template's. This workflow is the floor, even if an agent comes later.

Third, mark the forks. A fork is any moment where the next step depends on what the last step found. Which unit, camera or not, emergency or the afternoon route. If you can write it as a rule, it is still a workflow. "Water through the ceiling, page Chris" does not need a model.

Fourth, choose what the model may touch. We allow a draft, a suggested tech, and a suggested part. We forbid sending, pricing, and any sentence about who pays for damage. If the bound says "use your judgment," you have left a hole, and the model will fill it with something polite.

Fifth, name the stop and the person. Dana can stop it. Chris can stop it. A tech can kick back a job that arrived without the part. The system stops when a fact is missing, when the time sits outside the route, or when the caller is angry. Stopping is a success.

Sixth, replay recent jobs with the names covered. Dana compares the proposal with what the desk actually did. Hunt the confident wrong time. Fix the bounds before a live customer sees a message. Only then draft against today's calls, with send still in human hands. We would repeat that replay until the refusals look right, rather than turn on an automatic text because a trial is ending.

## Common mistakes

The first mistake is a rename. The chat box gets called an agent because the invoice said so. If a person still picks every next step, you have one prompt. That can be the right tool. The rename makes the staff expect judgment the box does not have.

The second mistake is skipping the written path because writing feels slow. Every exception becomes the model's problem, including ones a card by the phone could handle. The staff stops trusting the book. Dana goes back to memory, plus a fee.

The third mistake is a missing stop. The model may text, and nobody is named to halt it on a bad afternoon. The bad promise is usually small, a time the tech cannot make, and the customer hears it as the company.

The fourth mistake is treating the survey as a target. 23% scaling an agentic system somewhere in the enterprise is not a quota. 10% inside any one function is not a score you are failing. Chasing those shares buys a tool nobody can supervise.

The fifth mistake is letting the system near money. A price, a waived fee, a line about whether the landlord pays. A draft Chris edits is a different product from a message that already left.

The sixth mistake is a bound written as a mood. "Be helpful" is not a bound. "Do not offer a same-day visit unless Chris has marked the job urgent" is a bound. If Dana cannot enforce the sentence, the model will be helpful in the wrong direction.

## What we'd do

We would write Dana's path before we paid for anything that chooses its own tools. We would keep one prompt for the messy replies, a workflow for intake, and an agent only on the fork where the next visit depends on what the note contains. We would leave send on a human button longer than a vendor likes. Our opinion is plain. An agent is worth the trouble when the branch is real and a named person owns the stop. It is a poor purchase when the process is still a story the owner tells at the counter.

The 2024 essay says to earn the complexity. The 2025 survey says that even large firms, inside any one function, are mostly not scaling agents. We believe both. Then we go sit with the person who answers the phone, because that person already knows where the path breaks, and the software does not.
