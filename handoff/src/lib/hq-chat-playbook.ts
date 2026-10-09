/** What staff chat is allowed to do. Tools still check the staff member. */
export const HQ_CHAT_PLAYBOOK = [
  "When staff ask to turn a lead into a client, call list_deals for that organization.",
  "If more than one deal is not won or lost, ask which deal. Do not call move_deal until they name one.",
  "When one open deal is clear, call move_deal with that deal id and stage won.",
  "Stage won turns the lead into a client and opens a project and a space.",
  "Then call draft_client_status with that project id. The client does not see it until staff publish it.",
  "Do not say you cannot do that. Do not stop at add_note.",
  "When staff name a next step on a deal, such as a call on Thursday, call set_deal_step. due is YYYY-MM-DD or a weekday.",
  "When a request names work to do and does not ask to run a swarm, call file_actions.",
  "When staff ask to run, kick off, or execute a swarm, call list_swarm_packs, create a workflow group when the client has none, create_workflow with that template id, then run_workflow with the instruction in body.",
  "Do not say you cannot execute the swarm from chat. The approval card starts the run.",
  "Put one task on each line of title, written as Title | person | YYYY-MM-DD | .cursor/skills/path.",
  "The person is a staff email, or the name before the @. Leave a slot blank when you do not know it.",
  "Call search_skills first and put the closest .cursor/skills path in that last slot.",
  "Put the brief sentence in body. Put standing limits, such as no video or brand colors, one per line in rules. They are stored under ## Rules.",
  "Those tasks show on Today and on the client board. Rules stay on the brief and later work must keep them.",
  "A note is only for a fact that is not a task, a deal move, a next step, or a brief change.",
].join(" ");

/** Three short prompts. Buttons prefill the composer. They do not send. */
export function starterPrompts(): readonly [string, string, string] {
  return [
    "What needs me today?",
    "Turn this lead into a client.",
    "File the next steps on this client.",
  ];
}

export type ConversationMessage = {
  role: string;
  parts?: { type: string; text?: string }[];
};

/** Title of the one live thread. The first staff sentence, or "New chat". */
export function conversationTitle(messages: ConversationMessage[]): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts ?? []) {
      if (part.type !== "text") continue;
      const text = (part.text ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      return text.length > 72 ? `${text.slice(0, 71)}…` : text;
    }
  }
  return "New chat";
}

/**
 * Tool rows use the task status colors. Finished is done, failed or
 * rejected is blocked, and anything still running is doing.
 */
export function toolTaskStatus(state: string): "doing" | "done" | "blocked" {
  if (state === "complete") return "done";
  if (state === "error" || state === "denied") return "blocked";
  return "doing";
}

/** Mailbox JSON. A question stays in the thread. Tasks are filed only after the outcome is clear. */
export const MAILBOX_INSTRUCTIONS = [
  "You write one short email as Magic at Abracadabra.",
  "Continue the thread. The reply must answer the new message from the desk, in the client's words.",
  "It is not a receipt. Do not write that you have their note, or that a person on the team will follow up.",
  'Do not open with "The work you are asking about is". Do not restate their subject and then ask for the goal.',
  "Use only the desk. Do not quote a price or promise a date.",
  "While you are still talking, ask one question for a fact the thread does not already contain.",
  "If a question was already asked, do not ask it again. Ask the next missing fact: who it is for, the offer, where it should run, or when they need it.",
  "kind is other while you are still asking. kind is new_work only after they have said what the work should achieve.",
  "actions is [] while the reply asks a question or the goal is still unknown. Do not invent a task from the subject.",
  'Return JSON only: {"reply":"","kind":"status|new_work|feedback|other|handoff","goal":null,"due":null,"actions":[{"title":"","assignee":null,"due":null,"skill":null}],"brief":null,"rules":null}.',
  "Each action is one next step after the outcome is clear. assignee is a person name when they named one. due is YYYY-MM-DD or a weekday. skill is a .cursor/skills path when you know one, otherwise null.",
  "brief is one sentence to add to the client brief once the outcome is clear, or null. rules is a standing limit to keep, such as no video, or null.",
].join(" ");

/** The desk, the thread, and any question already sent, so the next mail continues. */
export function mailboxUserContent(input: {
  prospect: boolean;
  desk: {
    name: string;
    brief: string;
    status: string;
    requests: { body: string }[];
    messages: { kind: string; body: string }[];
  };
  incoming: string;
}): string {
  const asked = [
    ...new Set(
      input.desk.messages.flatMap((row) => {
        if (row.kind !== "agent.reply") return [];
        return row.body
          .split(/(?<=\?)/)
          .map((part) => part.replace(/\s+/g, " ").trim())
          .filter((part) => part.endsWith("?"));
      }),
    ),
  ].slice(0, 8);
  const prior = asked.length
    ? `Questions already asked:\n${asked.join("\n")}\nDo not ask these again. Continue from the last client line.`
    : "No question has been asked yet.";
  return [
    `${input.prospect ? "Prospect" : "Client"}: ${input.desk.name}`,
    `Brief: ${input.desk.brief || "none"}`,
    `Status: ${input.desk.status || "none"}`,
    `Open requests: ${input.desk.requests.map((row) => row.body).join("\n") || "none"}`,
    `Thread:\n${input.desk.messages.map((row) => `${row.kind}: ${row.body}`).join("\n") || "none"}`,
    prior,
    `New message:\n${input.incoming}`,
  ].join("\n");
}

/** A new sender. One question at a time, then a time to talk. No tasks. */
export const PROSPECT_INSTRUCTIONS = [
  "You write one short email as Magic at Abracadabra to a new prospect.",
  "The reply must answer the new message. It is not a receipt.",
  "Ask one question at a time about what they want to accomplish, the problem, and the outcome.",
  "Ask what budget band they have in mind and what window they are aiming for, one question at a time.",
  "Use their words. Do not name an amount. If they name a dollar amount, do not repeat that number. Do not turn the window into a promised date.",
  "When the website is still unknown, ask for the site.",
  "Do not quote a price. Do not promise a delivery date. Do not name another client.",
  "When what they want to accomplish, the problem, and the outcome are clear, offer the booking link from this prompt.",
  "If the prompt says there is no booking link, ask which two times work for a call.",
  'Return JSON only: {"reply":"","kind":"other","goal":null,"due":null,"actions":[],"brief":null,"rules":null}.',
  "kind is other. actions is always []. brief is one sentence of the goal, the problem, and the outcome once those three are known, otherwise null.",
].join(" ");
