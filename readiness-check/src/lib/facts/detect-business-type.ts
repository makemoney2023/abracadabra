import {
  isLocalBusinessFamily,
  isOrganizationType,
} from "@/lib/schema-org/organization-types";
import type { PageFacts } from "./types";

/** Chamber / board-of-trade language → Organization (schema.org has no BoardOfTrade type). */
export const BOARD_OF_TRADE_RE =
  /\bboard of trade\b|\bchamber of commerce\b|\bchambers of commerce\b|\bworld trade centre\b|\bworld trade center\b/i;

const RULES: Array<{ type: string; pattern: RegExp }> = [
  // Associations first — must beat LocalBusiness-from-address
  { type: "Organization", pattern: BOARD_OF_TRADE_RE },
  { type: "OnlineStore", pattern: /\b(shop|store|cart|checkout|ecommerce|e-commerce|buy now)\b/i },
  { type: "Restaurant", pattern: /\b(restaurant|bistro|diner|eatery)\b/i },
  { type: "CafeOrCoffeeShop", pattern: /\b(coffee shop|café|cafe)\b/i },
  { type: "Physician", pattern: /\b(physician|md\b|doctor of|family doctor)\b/i },
  { type: "Dentist", pattern: /\b(dentist|dental|orthodont)\b/i },
  { type: "MedicalClinic", pattern: /\b(medical clinic|clinic)\b/i },
  { type: "Hospital", pattern: /\bhospital\b/i },
  { type: "MedicalBusiness", pattern: /\b(chiropractic|chiropractor|physiotherapy|optometr|medical|healthcare|health care)\b/i },
  { type: "Attorney", pattern: /\b(attorney|lawyer|law firm|legal services)\b/i },
  { type: "RealEstateAgent", pattern: /\b(real estate|realtor)\b/i },
  { type: "Plumber", pattern: /\bplumber|plumbing\b/i },
  { type: "Electrician", pattern: /\belectrician\b/i },
  { type: "HVACBusiness", pattern: /\bhvac\b|heating and cooling/i },
  { type: "GeneralContractor", pattern: /\bgeneral contractor|construction company\b/i },
  { type: "HairSalon", pattern: /\bhair salon|barber\b/i },
  { type: "DaySpa", pattern: /\bday spa|spa\b/i },
  { type: "Hotel", pattern: /\bhotel\b/i },
  { type: "CollegeOrUniversity", pattern: /\buniversity|college\b/i },
  { type: "EducationalOrganization", pattern: /\bschool|academy|education\b/i },
  { type: "NewsMediaOrganization", pattern: /\bnewsroom|newspaper|news media\b/i },
  { type: "NGO", pattern: /\bnonprofit|non-profit|ngo|charity\b/i },
  { type: "GovernmentOrganization", pattern: /\bgovernment|municipal|city of\b/i },
  { type: "SportsTeam", pattern: /\bsports team|football club|soccer club\b/i },
  { type: "Corporation", pattern: /\bcorporation|inc\.|incorporated\b/i },
  { type: "AccountingService", pattern: /\baccountant|cpa|bookkeeping\b/i },
  { type: "InsuranceAgency", pattern: /\binsurance agency|insurance broker\b/i },
  { type: "AutoRepair", pattern: /\bauto repair|car repair|mechanic\b/i },
  { type: "TravelAgency", pattern: /\btravel agency|travel agent\b/i },
];

function detectionBlob(
  facts: PageFacts,
  extras?: { urls?: string[]; markdown?: string; domain?: string },
): string {
  return [
    facts.description,
    facts.businessName,
    extras?.markdown,
    extras?.domain,
    ...(extras?.urls ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

/** True when site copy indicates a board of trade / chamber of commerce. */
export function isBoardOfTradeOrChamber(
  facts: PageFacts,
  extras?: { urls?: string[]; markdown?: string; domain?: string },
): boolean {
  return BOARD_OF_TRADE_RE.test(detectionBlob(facts, extras));
}

/**
 * Heuristic business type from PageFacts — returns the most specific Organization-tree type.
 * Boards of trade / chambers map to Organization (no BoardOfTrade type in schema.org).
 */
export function detectBusinessType(
  facts: PageFacts,
  extras?: { urls?: string[]; markdown?: string; domain?: string },
): string {
  const types = facts.existingTypes.filter(isOrganizationType);
  // Prefer most specific existing JSON-LD org type (longest ancestor chain wins later)
  if (types.length) {
    // Prefer leaf-ish types over Organization/LocalBusiness
    const ranked = [...types].sort((a, b) => {
      const score = (t: string) =>
        t === "Organization" ? 0 : t === "LocalBusiness" ? 1 : t === "OnlineStore" ? 2 : 3;
      return score(b) - score(a);
    });
    // Chamber sites sometimes ship only LocalBusiness — override with Organization
    if (ranked[0] === "LocalBusiness" && isBoardOfTradeOrChamber(facts, extras)) {
      return "Organization";
    }
    if (ranked[0] && ranked[0] !== "Organization") return ranked[0];
  }

  const blob = detectionBlob(facts, extras);

  for (const rule of RULES) {
    if (rule.pattern.test(blob) && isOrganizationType(rule.type)) {
      return rule.type;
    }
  }

  if ((extras?.urls ?? []).some((u) => /\/(shop|store|cart)\b/i.test(u))) {
    return "OnlineStore";
  }

  // Chambers with street addresses must not become LocalBusiness (forces manual subtype + address gate)
  if (isBoardOfTradeOrChamber(facts, extras)) {
    return "Organization";
  }

  if (facts.address?.addressLocality || facts.address?.streetAddress) {
    return "LocalBusiness";
  }

  if (types.includes("Organization")) return "Organization";
  return "Organization";
}

export function businessTypeNeedsAddress(type: string): boolean {
  return isLocalBusinessFamily(type);
}
