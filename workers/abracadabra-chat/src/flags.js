// Feature switches for the phase-2 chat features (docs/conversation-plan.md). Each one is a plain var in
// wrangler.jsonc, so a feature can be turned off with a one-line change and a redeploy, no code change.
//   CHAT_AUDIT          live mini-audit through the Schema scanner          (off unless "true"; on in wrangler.jsonc)
//   RECEPTIONIST_DEMO   voice receptionist role-play on the Voice page     (off unless "true"; on in wrangler.jsonc)
//   CHAT_RECAP_CARD     "Here's what I heard" card at goodbye or on request (on unless "false")
//   CHAT_CLIPS          film card when a case study with a film is cited    (on unless "false")
const DEFAULTS = { CHAT_AUDIT: false, RECEPTIONIST_DEMO: false, CHAT_RECAP_CARD: true, CHAT_CLIPS: true };

export function flag(env, name) {
  const raw = String(env?.[name] ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return Boolean(DEFAULTS[name]);
}
