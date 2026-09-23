import { mergeBusinessFacts } from "@/lib/facts/extract-page-facts";
import type { BusinessType, FaqPair, PostalAddressFacts } from "@/lib/facts/types";
import { isLocalBusinessFamily } from "@/lib/schema-org/organization-types";
import { pageEvidenceOrEmpty } from "@/lib/scan/attach-page-facts";
import type { FixPackageInput, FixSelection } from "./generate-package";
// Note: value import avoided — only types from generate-package to prevent cycles.

export type RequiredField = {
  id: string;
  label: string;
  reason: string;
};

function factsFor(page: FixPackageInput["pages"][number]) {
  return pageEvidenceOrEmpty(page);
}

function resolveFaqPairs(input: FixPackageInput, selection?: FixSelection): FaqPair[] {
  if (selection?.faqPairs?.length) {
    return selection.faqPairs.filter((p) => p.question.trim() && p.answer.trim());
  }
  const merged = mergeBusinessFacts(input.pages.map(factsFor));
  return merged.faqPairs;
}

function resolveAddress(
  input: FixPackageInput,
  selection?: FixSelection,
): PostalAddressFacts | undefined {
  if (selection?.address) return selection.address;
  if (input.overrides?.address) return input.overrides.address;
  return mergeBusinessFacts(input.pages.map(factsFor)).address;
}

function addressComplete(address: PostalAddressFacts | undefined): boolean {
  if (!address) return false;
  return Boolean(
    address.streetAddress?.trim() &&
      address.addressLocality?.trim() &&
      address.addressCountry?.trim(),
  );
}

/**
 * Fields the user must supply before download/generate for the current selection.
 * Optional Schema.org properties are omitted when unknown — they are not required.
 */
export function computeRequiredFields(
  input: FixPackageInput,
  selection?: FixSelection,
): RequiredField[] {
  const fields: RequiredField[] = [];
  const pageUrls = selection?.pageUrls ?? [];
  const homeSelected = pageUrls.some((url) => {
    const page = input.pages.find((p) => p.url === url);
    return page?.pageType === "home";
  });

  const businessType: BusinessType =
    selection?.businessType || input.overrides?.businessType || "Organization";

  if (
    homeSelected &&
    isLocalBusinessFamily(businessType) &&
    !addressComplete(resolveAddress(input, selection))
  ) {
    const address = resolveAddress(input, selection);
    if (!address?.streetAddress?.trim()) {
      fields.push({
        id: "streetAddress",
        label: "Street address",
        reason: `${businessType} schema needs a street address`,
      });
    }
    if (!address?.addressLocality?.trim()) {
      fields.push({
        id: "addressLocality",
        label: "City",
        reason: `${businessType} schema needs a city / locality`,
      });
    }
    if (!address?.addressCountry?.trim()) {
      fields.push({
        id: "addressCountry",
        label: "Country",
        reason: `${businessType} schema needs a country code`,
      });
    }
  }

  if (selection?.faqJsonLd === true && resolveFaqPairs(input, selection).length === 0) {
    fields.push({
      id: "faqPairs",
      label: "FAQ question & answer",
      reason: "FAQPage JSON-LD needs at least one real Q&A pair",
    });
  }

  return fields;
}
