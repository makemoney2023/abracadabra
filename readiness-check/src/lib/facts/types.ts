/** Schema.org Organization-tree type name (see organization-types catalog). */
export type BusinessType = string;

export type FaqPair = {
  question: string;
  answer: string;
};

export type PostalAddressFacts = {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
};

/** Structured facts derived during scan for fix generation (stored in scan_pages.evidence). */
export type PageFacts = {
  businessName?: string;
  description?: string;
  emails: string[];
  phones: string[];
  logoUrl?: string;
  sameAs: string[];
  address?: PostalAddressFacts;
  faqPairs: FaqPair[];
  headline?: string;
  datePublished?: string;
  dateModified?: string;
  image?: string;
  /** Explicit free/trial price text when confidently found (never invent). */
  freeOfferPrice?: string;
  freeOfferCurrency?: string;
  hasSiteSearch: boolean;
  /** Detected public search URL template, e.g. https://example.com/search?q={search_term_string} */
  searchUrlTemplate?: string;
  openingHours?: string[];
  geo?: { latitude: number; longitude: number };
  reviews: Array<{ author?: string; reviewBody: string }>;
  howtoSteps: Array<{ name: string; text: string }>;
  existingTypes: string[];
  existingBlocks: unknown[];
};

export function emptyPageFacts(): PageFacts {
  return {
    emails: [],
    phones: [],
    sameAs: [],
    faqPairs: [],
    reviews: [],
    howtoSteps: [],
    hasSiteSearch: false,
    existingTypes: [],
    existingBlocks: [],
  };
}

export type FixOverrides = {
  businessName?: string;
  businessType?: BusinessType;
  email?: string;
  phone?: string;
  logoUrl?: string;
  sameAs?: string[];
  includeSearchAction?: boolean;
  searchUrlTemplate?: string;
  openingHours?: string[];
  address?: PostalAddressFacts;
  faqPairs?: FaqPair[];
};
