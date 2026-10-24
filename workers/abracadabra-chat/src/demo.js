// Receptionist demo (voice only): on the Voice service page the assistant can play a receptionist for
// the visitor's own kind of business, so they hear what a voice agent would sound like for them. It is
// labelled as a demo when it starts and in the call panel, ends on "stop demo", after DEMO_MS or after
// DEMO_TURNS, and then says one line about what the real thing would do. In the role it never takes a
// booking or a payment and never asks for personal or health details: those sentences are dropped.
import { normalizePath } from "./page-context.js";

export const DEMO_PAGE = "/services/voice-and-realtime-agents/";
export const DEMO_MS = 2 * 60 * 1000;
export const DEMO_TURNS = 8;

const BUSINESS = {
  "dental clinic": "a dental clinic",
  "medical clinic": "a clinic",
  "law firm": "a law firm",
  "accounting firm": "an accounting firm",
  "real estate": "a real estate office",
  insurance: "an insurance brokerage",
  construction: "a construction company",
  "home services": "a home services company",
  restaurant: "a restaurant",
  retail: "a store",
  "salon or spa": "a salon",
  fitness: "a gym",
  "marketing agency": "a marketing agency",
  logistics: "a logistics company",
  manufacturing: "a manufacturing shop",
  nonprofit: "a nonprofit",
  "school or training": "a school",
  "software company": "a software company",
};

export function onDemoPage(page) {
  return normalizePath(page || "") === DEMO_PAGE;
}

export function demoBusiness(visitor) {
  return BUSINESS[visitor?.industry] || "a local business";
}

const START = /\b(?:(?:start|try|do|run|show|begin|play|give)\b[^.?!]{0,30}\b(?:demo|role[- ]?play)|(?:be|act as|play) (?:my|our|a|the) receptionist|pretend (?:to be|you'?re) (?:my|our|a) receptionist|yes,? (?:please,? )?(?:the |a )?demo)\b/i;
const STOP = /\b(?:stop|end|exit|quit|cancel|finish|leave|done with)\b[^.?!]{0,15}\b(?:demo|role[- ]?play)\b|^\s*(?:stop|stop it|stop now|end it)[.!]?\s*$/i;

/** "start" | "stop" | null for one visitor message. */
export function demoIntent(text) {
  const value = String(text || "");
  if (STOP.test(value)) return "stop";
  if (START.test(value)) return "start";
  return null;
}

/** Questions a demo receptionist must never ask: contact, payment, identity or health details. */
export const DEMO_ASK = /\b(?:date of birth|birth ?date|health (?:card|number)|insurance (?:number|id|details|provider|policy)|policy number|card (?:number|details)|credit card|debit card|cvv|expir\w* date|social insurance|sin number|social security|ssn|symptoms?|medical history|diagnos\w*|medications?|prescriptions?|allerg\w*|pain level|your (?:full )?(?:name|address|phone|number|e-?mail)|(?:pay|payment|deposit)\b[^.?!]{0,30}\b(?:now|today|over the phone)|(?:i(?:'ve| have)|i'll|i will|i can) (?:booked|book|confirmed|confirm|scheduled|schedule|charged|charge|taken|take) (?:you|your|that|it|a payment|the payment|an appointment|the appointment)|(?:i(?:'ve| have)|i'll|i will|i can|let me) (?:put|pencil(?:l?ed)?|got|get|slot(?:ted)?|squeeze|fit) you (?:down|in)|you(?:'re| are) (?:all )?(?:booked|set|confirmed|scheduled)|(?:your|the) (?:appointment|booking|reservation|table) is (?:booked|confirmed|set))\b/i;

export function demoPrompt(visitor) {
  const business = demoBusiness(visitor);
  return [
    `You are playing the phone receptionist for ${business}, in a short demo run by Abracadabra (an AI studio). The caller is a business owner trying the demo; this is not a real call.`,
    "Sound warm and natural, like a good front desk. One or two short sentences per turn, under 30 words. No lists, no markdown.",
    "Invent nothing specific: no prices, addresses, staff names or opening hours. Speak in general terms (\"we have openings most weekdays\").",
    "Never take a real booking or payment. If they want to book or pay, say that in the real system you would book it straight into their calendar or send a payment link, and that this demo does not book anything.",
    "Never ask for or repeat personal details: no name, phone, email, address, date of birth, health card, insurance, symptoms, medical history or card numbers. If they share any, say you won't keep that in a demo and carry on in general terms.",
    "If they describe an emergency or urgent symptom (chest pain, trouble breathing, heavy bleeding, a gas smell, a fire), say first, out of role if needed, to call 911 or emergency services now.",
    "If they ask something you cannot answer, say you would hand it to the team with a note, as the real system would.",
    "Stay in the role. If they say stop demo, they leave the demo.",
  ].join("\n");
}

export function demoOpening(visitor) {
  return `Okay, demo mode: for two minutes I'm the receptionist at ${demoBusiness(visitor)}. Please don't share real personal details, and say stop demo to end it. Ring ring, thanks for calling. How can I help?`;
}

export function demoTakeaway(visitor, reason = "stop") {
  const lead = reason === "time" ? "That's two minutes, so that's the end of the demo." : "That's the end of the demo.";
  return `${lead} For ${demoBusiness(visitor)}, the real receptionist would answer from your own records and hand a call to your team with a note.`;
}

/** The line offered once on the Voice page, in the system prompt's THIS TURN notes. */
export const DEMO_OFFER_NOTE = "This visitor is on the Voice agents page. If it fits, you may offer once: a two-minute demo where you play the receptionist for their kind of business. They start it by saying \"start the demo\" and stop it with \"stop demo\". Do not offer it again if they said no.";

export function demoExpired(demo, now) {
  return Boolean(demo?.active && (now - Number(demo.startedAt || 0) >= DEMO_MS || Number(demo.turns || 0) >= DEMO_TURNS));
}

/** Said in the role when every sentence of a demo reply was dropped or a rule replaced it. */
export const DEMO_LINES = [
  "In this demo I'll keep that general. What else can I help with?",
  "I'd pass that to the team with a note. Is there anything else I can help with?",
];
