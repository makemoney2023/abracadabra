export function normalizeDomain(input: string): { domain: string; origin: string } {
  const raw = input.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Invalid domain");
  }
  if (!url.hostname.includes(".")) throw new Error("Invalid domain");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return { domain: host, origin: `https://${host}` };
}
