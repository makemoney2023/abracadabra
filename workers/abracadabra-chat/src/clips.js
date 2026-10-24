// Case-study film cards: when a reply cites a case study that has a film on /films.html, the chat shows
// one inline card with the film's thumbnail, its Films-page caption and links. Only films that already
// exist on the site (scrollcraft/builds/abracadabra-ai/assets/films/), with the titles and captions the
// Films page uses. The films are silent screen captures, so the caption text is the description.
export const FILMS_PAGE = "/films.html";

export const CLIPS = [
  {
    id: "strongfoam-erp-demo",
    title: "StrongFoam CRM/ERP: lead to closeout",
    caption: "One job from inbound email to estimate, schedule, field notes, and closeout, in 3 minutes.",
    page: "/portfolio/strongfoam-crm/",
    cites: [/\bstrongfoam\s+(?:crm|erp)\b/i, /\/portfolio\/strongfoam-crm\b/i],
  },
  {
    id: "superfunnel-getting-started",
    title: "Super Funnel: getting started",
    caption: "The home dashboard, setup, pipeline, and navigation, in 66 seconds.",
    page: "/portfolio/super-funnel/",
    cites: [/\bsuper ?funnel\b/i, /\/portfolio\/super-funnel\b/i],
  },
  {
    id: "schema-home-scan",
    title: "Schema: live home",
    caption: "A live capture of the Schema home page.",
    page: "/portfolio/schema/",
    cites: [/\bschema\.abra-ca-dabra\.app\b/i, /\/portfolio\/schema\b/i, /\/products\/schema\b/i, /\bSchema (?:scanner|app|product)\b/],
  },
  {
    id: "llmcourse-home-lesson",
    title: "LLM Leverage: home and lesson",
    caption: "A live capture of the course home and a lesson.",
    page: "/portfolio/llm-leverage/",
    cites: [/\bLLM Leverage\b/i, /\/portfolio\/llm-leverage\b/i, /\blearn\.abra-ca-dabra\.app\b/i],
  },
];

export function clipCard(clip) {
  return {
    kind: "clip",
    id: clip.id,
    title: clip.title,
    caption: clip.caption,
    poster: `/assets/films/thumbs/${clip.id}.jpg`,
    src: `/assets/films/${clip.id}.mp4`,
    page: clip.page,
    films: FILMS_PAGE,
  };
}

/** The film card for the first case study the answer cites and this chat has not shown yet, or null. */
export function clipFor(answer, shown = []) {
  const text = String(answer || "");
  if (!text) return null;
  const hit = CLIPS.find((clip) => !shown.includes(clip.id) && clip.cites.some((re) => re.test(text)));
  return hit ? clipCard(hit) : null;
}
