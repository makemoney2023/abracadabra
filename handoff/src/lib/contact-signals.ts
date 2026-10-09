// Keep in step with readiness-check/src/lib/facts/contact-signals.ts.
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const FORMATTED_PHONE = /(?<!\d)(?:\+?1[\s.-])?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;
const BARE_PHONE = /(?<!\d)\+?1?[2-9]\d{2}[2-9]\d{6}(?!\d)/g;
const INTERNATIONAL_PHONE = /(?<!\d)\+\d{1,3}(?:[\s.-]\d{2,4}){2,3}(?!\d)/g;

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function nationalOk(digits: string): boolean {
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(national);
}

/** Digits used to treat 613-841-6111 and +16138416111 as the same number. */
export function phoneKey(value: string): string {
  const digits = digitsOf(value);
  if (digits.length === 11 && digits.startsWith("1") && nationalOk(digits)) return digits.slice(1);
  return digits;
}

/** A number published as a phone. Script versions, map coordinates, and long ids are not phones. */
export function publishedPhone(value: string): string | null {
  const trimmed = value.trim().replace(/^tel:/i, "").split("?")[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return null;
  const digits = digitsOf(trimmed);
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.length >= 12 && !trimmed.startsWith("+")) return null;
  if ((digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) && !nationalOk(digits)) return null;
  return trimmed.slice(0, 40);
}

export function preferPhone(current: string, next: string): string {
  const score = (phone: string) => {
    if (/\(\d{3}\)\s*\d{3}-\d{4}/.test(phone)) return 4;
    if (/\d{3}-\d{3}-\d{4}/.test(phone)) return 3;
    if (/[\s().-]/.test(phone)) return 2;
    if (phone.startsWith("+")) return 1;
    return 0;
  };
  return score(next) > score(current) ? next : current;
}

export function dedupePhones(values: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const value of values) {
    const phone = publishedPhone(value);
    if (!phone) continue;
    const key = phoneKey(phone);
    const current = byKey.get(key);
    byKey.set(key, current ? preferPhone(current, phone) : phone);
  }
  return [...byKey.values()];
}

export function cleanEmail(value: string): string | null {
  const email = value.trim().toLowerCase().replace(/^mailto:/i, "").split("?")[0]?.trim() ?? "";
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  if (/\.(png|jpe?g|gif|svg|webp|js|css)$/.test(email)) return null;
  return email;
}

/** Cloudflare replaces public emails with a hex string. The first byte is the XOR key. */
export function decodeCloudflareEmail(hex: string): string | null {
  const cleanHex = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(cleanHex) || cleanHex.length < 4 || cleanHex.length % 2 !== 0) return null;
  const key = Number.parseInt(cleanHex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < cleanHex.length; i += 2) {
    const code = Number.parseInt(cleanHex.slice(i, i + 2), 16) ^ key;
    if (code < 32 || code > 126) return null;
    out += String.fromCharCode(code);
  }
  return cleanEmail(out);
}

/** The brand after a page title such as "All-on-4 Dental Implants Ottawa | Renew Implants". */
export function brandFromTitle(title: string): string {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const parts = cleaned.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const brand = parts[parts.length - 1] ?? "";
    if (brand.length >= 2 && brand.length <= 80) return brand;
  }
  return cleaned;
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

export function emailsFromHtml(html: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  function add(value: string | null) {
    if (!value || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  }
  for (const match of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-fA-F]+)["']/gi)) {
    add(decodeCloudflareEmail(match[1] ?? ""));
  }
  for (const match of html.matchAll(/email-protection#([0-9a-fA-F]+)/gi)) {
    add(decodeCloudflareEmail(match[1] ?? ""));
  }
  for (const match of html.matchAll(/mailto:([^"'?\s>]+)/gi)) add(cleanEmail(match[1] ?? ""));
  const text = /<[a-z!/]/i.test(html) ? visibleText(html) : html;
  for (const match of text.matchAll(EMAIL_RE)) add(cleanEmail(match[0] ?? ""));
  return found;
}

export function phonesFromHtml(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']tel:([^"'>\s]+)/gi)) {
    let raw = match[1] ?? "";
    try {
      raw = decodeURIComponent(raw);
    } catch {
      raw = match[1] ?? "";
    }
    const phone = publishedPhone(raw);
    if (phone) found.push(phone);
  }
  const text = /<[a-z!/]/i.test(html) ? visibleText(html) : html;
  for (const pattern of [FORMATTED_PHONE, INTERNATIONAL_PHONE, BARE_PHONE]) {
    for (const match of text.matchAll(pattern)) {
      const phone = publishedPhone(match[0] ?? "");
      if (phone) found.push(phone);
    }
  }
  return dedupePhones(found);
}
