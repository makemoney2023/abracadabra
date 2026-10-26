/**
 * The one Organization entity for abra-ca-dabra.app (card af12f861).
 *
 * Every page graph uses `orgNode()` so `#org` means the same thing everywhere.
 * The homepage adds `homeOrgNode()` detail: description, topics, contact and the
 * services catalog.
 *
 * Rules:
 * - `ORG_SAME_AS` holds only profiles verified to belong to this business (the URL
 *   resolves and names abra-ca-dabra.app or links back). It is empty until one exists.
 *   Schema must not point at a surface that does not exist.
 * - No street address, PostalAddress or LocalBusiness type until a real business
 *   address is published on the site and confirmed by the owner.
 * - No Person or founder node. Since #109 the public voice is the house byline
 *   (Abracadabra Studio) with no personal name. Changing that is an owner decision.
 */
export const SITE = "https://abra-ca-dabra.app";
export const ORG_ID = `${SITE}/#org`;
export const ORG_LOGO_ID = `${SITE}/#logo`;
export const ORG_NAME = "Abracadabra AI";
export const ORG_ALTERNATE_NAMES = ["Abra-ca-dabra", "abra-ca-dabra.app"];
export const ORG_EMAIL = "houdini@abra-ca-dabra.app";

/** Separates this studio from other businesses and apps that use the Abracadabra name. */
export const ORG_DISAMBIGUATION =
  "Abracadabra AI, at abra-ca-dabra.app, is a studio that designs, builds and runs custom software and AI tools around how a business already works. It makes Schema, the LLM Leverage course and HQ, its client workspace.";

/** Verified profiles only. See the rules above before adding a URL. */
export const ORG_SAME_AS = [];

export const ORG_KNOWS_ABOUT = [
  "Custom software, built for how you work",
  "Prompt engineering",
  "Context engineering",
  "AI agents for business operations",
  "Answer engine optimization (AEO)",
  "Generative engine optimization (GEO)",
  "Search engine optimization (SEO)",
  "Direct sales enablement software",
];

function logoNode() {
  return {
    "@type": "ImageObject",
    "@id": ORG_LOGO_ID,
    url: `${SITE}/assets/icons/icon-512.png`,
    contentUrl: `${SITE}/assets/icons/icon-512.png`,
    width: 512,
    height: 512,
    caption: ORG_NAME,
  };
}

/** The Organization node every page graph carries. */
export function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: ORG_NAME,
    alternateName: [...ORG_ALTERNATE_NAMES],
    url: `${SITE}/`,
    logo: logoNode(),
    email: ORG_EMAIL,
    slogan: "From thought to working software",
    disambiguatingDescription: ORG_DISAMBIGUATION,
    ...(ORG_SAME_AS.length ? { sameAs: [...ORG_SAME_AS] } : {}),
  };
}

/**
 * The homepage Organization node: the shared node plus what the homepage says.
 * `services` is a list of { name, url, id } for the live /services/<slug>/ pages.
 */
export function homeOrgNode(services) {
  return {
    ...orgNode(),
    description: "We design, build and run AI-powered tools that fit your business, not the other way around.",
    knowsAbout: [...ORG_KNOWS_ABOUT],
    contactPoint: {
      "@type": "ContactPoint",
      email: ORG_EMAIL,
      contactType: "sales",
      availableLanguage: "en",
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      "@id": `${SITE}/services/#catalog`,
      name: "Services",
      url: `${SITE}/services/`,
      itemListElement: services.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          "@id": service.id,
          name: service.name,
          url: service.url,
          provider: { "@id": ORG_ID },
          areaServed: "Worldwide",
        },
      })),
    },
  };
}
