import catalogJson from "./organization-types.json";

export type OrganizationTypeEntry = {
  name: string;
  parent: string | null;
  parents: string[];
  ancestors: string[];
};

const catalog = catalogJson as OrganizationTypeEntry[];
const byName = new Map(catalog.map((e) => [e.name, e]));

/** All schema.org types in the Organization tree (transitive subtypes). */
export function listOrganizationTypes(): OrganizationTypeEntry[] {
  return catalog;
}

export function isOrganizationType(type: string): boolean {
  return byName.has(type);
}

/** LocalBusiness or any descendant (Restaurant, Physician, Store, …). */
export function isLocalBusinessFamily(type: string): boolean {
  if (type === "LocalBusiness") return true;
  const entry = byName.get(type);
  if (!entry) return false;
  return entry.ancestors.includes("LocalBusiness") || entry.parents.includes("LocalBusiness");
}

/** OnlineBusiness or OnlineStore (pure ecommerce). */
export function isOnlineBusinessFamily(type: string): boolean {
  if (type === "OnlineBusiness" || type === "OnlineStore") return true;
  const entry = byName.get(type);
  if (!entry) return false;
  return (
    entry.ancestors.includes("OnlineBusiness") ||
    entry.parents.includes("OnlineBusiness") ||
    entry.ancestors.includes("OnlineStore")
  );
}

export function getOrganizationType(type: string): OrganizationTypeEntry | undefined {
  return byName.get(type);
}

/** Types commonly offered in UI before the long tail (still searchable). */
export const FEATURED_ORGANIZATION_TYPES = [
  "Organization",
  "LocalBusiness",
  "OnlineStore",
  "OnlineBusiness",
  "Corporation",
  "NGO",
  "MedicalBusiness",
  "Physician",
  "Dentist",
  "MedicalClinic",
  "Hospital",
  "Restaurant",
  "Store",
  "Attorney",
  "RealEstateAgent",
  "EducationalOrganization",
  "CollegeOrUniversity",
  "NewsMediaOrganization",
  "SportsOrganization",
  "GovernmentOrganization",
] as const;
