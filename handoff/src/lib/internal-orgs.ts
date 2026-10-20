/**
 * Test, internal and vendor organizations. They stay in the CRM but Today, the Pipeline panel and lead counts hide
 * them (organizations.is_internal, migration 0030). New rows get the flag from these rules; staff can flip it on the
 * client's Settings tab.
 */

const INTERNAL_NAMES = [/^test e2e\b/i, /^e2e test\b/i, /\binternal test\b/i, /\(delete me\)/i, /\bdo not contact\b/i];

/** Mailers that intake once turned into leads. Their newsletters are not prospects. */
const VENDOR_DOMAINS = new Set(["muapi.ai", "mail.cursor.com"]);

/** Bulk-mail sending subdomains (mail.vendor.com, news.vendor.com). */
const BULK_PREFIX = /^(mail|email|news|newsletter|marketing|mailer)\./i;

function hostOf(value: string): string {
  const trimmed = value.trim().toLowerCase();
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "");
  } catch {
    return trimmed;
  }
}

export function isVendorDomain(domainOrUrl: string | null | undefined): boolean {
  if (!domainOrUrl?.trim()) return false;
  const host = hostOf(domainOrUrl);
  return VENDOR_DOMAINS.has(host) || BULK_PREFIX.test(host);
}

export function looksInternal(name: string, domainOrUrl: string | null | undefined): boolean {
  return INTERNAL_NAMES.some((pattern) => pattern.test(name.trim())) || isVendorDomain(domainOrUrl);
}

/** 0 or 1 for an INSERT. */
export function internalFlag(name: string, domainOrUrl: string | null | undefined): 0 | 1 {
  return looksInternal(name, domainOrUrl) ? 1 : 0;
}
