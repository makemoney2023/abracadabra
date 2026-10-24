// Cards shown after a reply (typed or voice): the recap card at goodbye or on request, and a case-study
// film card when the answer cites one. Each behind its flag (flags.js); each at most once where it says.
import { endingIntent } from "./conversation.js";
import { clipFor } from "./clips.js";
import { flag } from "./flags.js";
import { recapCard, recapIntent } from "./recap.js";

/** Cards for this exchange; records what was shown on the session (for stats and "once" rules). */
export function cardsFor(session, env, userText, answer) {
  const cards = [];
  if (flag(env, "CHAT_RECAP_CARD")) {
    const asked = recapIntent(userText);
    const leaving = Boolean(endingIntent(userText)) && !session.recapAtGoodbye;
    if (asked || leaving) {
      const card = recapCard(session);
      if (card) {
        cards.push(card);
        session.recapShown = (session.recapShown || 0) + 1;
        if (leaving) session.recapAtGoodbye = true;
      }
    }
  }
  if (flag(env, "CHAT_CLIPS")) {
    const clip = clipFor(answer, session.clipsShown || []);
    if (clip) {
      cards.push(clip);
      session.clipsShown = [...(session.clipsShown || []), clip.id].slice(-10);
    }
  }
  return cards;
}

export const RECAP_REPLY = "Here's what I heard so far, in the card below. If it looks right, you can book a working session with it attached.";
