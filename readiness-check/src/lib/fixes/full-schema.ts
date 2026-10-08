import { generateFixPackage, type FixPackage, type FixPackageInput } from "./generate-package";

/** Every fetched page, plus the site files, from facts the scan actually found. */
export function fullSchemaPackage(input: FixPackageInput): FixPackage {
  const pageUrls = input.pages.filter((page) => page.fetchStatus === "ok").map((page) => page.url);
  return generateFixPackage(input, {
    allPages: true,
    llmsTxt: true,
    llmsFullTxt: true,
    sitemapXml: true,
    robotsTxt: true,
    faqJsonLd: true,
    pageUrls,
    businessName: input.businessName,
  });
}
