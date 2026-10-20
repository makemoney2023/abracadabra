/**
 * scripts/stripe-setup.mjs against a fake Stripe (no network, no account).
 * Proves: test-mode only, idempotent (second run creates nothing), prints IDs only.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(__dirname, "../../scripts/stripe-setup.mjs");

// Preloaded into the script's process: replaces fetch with an in-memory Stripe that
// persists to a JSON file between runs and logs every write.
const FAKE = `
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const file = process.env.FAKE_STRIPE_STATE;
const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { products: {}, prices: [], coupons: {}, writes: [] });
globalThis.fetch = async (url, init = {}) => {
  const s = load();
  const u = new URL(url);
  const p = u.pathname.replace("/v1", "");
  const form = Object.fromEntries(new URLSearchParams(init.body ?? ""));
  const json = (status, data) => { writeFileSync(file, JSON.stringify(s)); return new Response(JSON.stringify(data), { status }); };
  if (!String(init.headers?.authorization ?? "").startsWith("Bearer sk_test_")) return json(401, { error: { message: "bad key" } });
  const method = init.method ?? "GET";
  if (method === "POST") s.writes.push(p);
  let m;
  if ((m = p.match(/^\\/products\\/(.+)$/)) && method === "GET") return s.products[m[1]] ? json(200, s.products[m[1]]) : json(404, { error: { message: "No such product" } });
  if (p === "/products" && method === "POST") { s.products[form.id] = { id: form.id, name: form.name }; return json(200, s.products[form.id]); }
  if (p === "/prices" && method === "GET") { const k = u.searchParams.get("lookup_keys[]"); return json(200, { data: s.prices.filter((x) => x.lookup_key === k) }); }
  if (p === "/prices" && method === "POST") { const price = { id: "price_fake_" + (s.prices.length + 1), product: form.product, unit_amount: Number(form.unit_amount), currency: form.currency, lookup_key: form.lookup_key }; s.prices.push(price); return json(200, price); }
  if ((m = p.match(/^\\/coupons\\/(.+)$/)) && method === "GET") return s.coupons[m[1]] ? json(200, s.coupons[m[1]]) : json(404, { error: { message: "No such coupon" } });
  if (p === "/coupons" && method === "POST") { s.coupons[form.id] = { id: form.id, amount_off: Number(form.amount_off), currency: form.currency, duration: form.duration }; return json(200, s.coupons[form.id]); }
  return json(400, { error: { message: "unexpected " + method + " " + p } });
};
`;

function run(env: Record<string, string>, state: string, preload: string) {
  const res = spawnSync(process.execPath, ["--import", preload, SCRIPT], {
    env: { PATH: process.env.PATH ?? "", FAKE_STRIPE_STATE: state, ...env },
    encoding: "utf8",
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

describe("scripts/stripe-setup.mjs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stripe-setup-"));
  const preload = path.join(dir, "fake-stripe.mjs");
  writeFileSync(preload, FAKE);

  it("refuses a missing or live key before calling Stripe", () => {
    const state = path.join(dir, "refuse.json");
    expect(run({}, state, preload).code).toBe(1);
    const live = run({ STRIPE_SECRET_KEY: "sk_live_abc" }, state, preload);
    expect(live.code).toBe(1);
    expect(live.err).toMatch(/test-mode/);
    expect(live.err).not.toContain("sk_live_abc");
  });

  it("creates the product, $149.99 price and $10 coupon once, then reuses them", () => {
    const state = path.join(dir, "state.json");
    const key = { STRIPE_SECRET_KEY: "sk_test_secret123" };
    const first = run(key, state, preload);
    expect(first.code, first.err).toBe(0);
    expect(first.out.trim().split("\n")).toEqual([
      "STRIPE_PRODUCT_ID=schema_fix_files",
      "STRIPE_PRICE_ID=price_fake_1",
      "STRIPE_CREDIT_COUPON_ID=schema_files_credit_10_usd",
    ]);
    expect(first.out + first.err).not.toContain("sk_test_secret123");

    const saved = JSON.parse(readFileSync(state, "utf8"));
    expect(saved.prices[0]).toMatchObject({ unit_amount: 14999, currency: "usd", product: "schema_fix_files" });
    expect(saved.coupons.schema_files_credit_10_usd).toMatchObject({ amount_off: 1000, currency: "usd", duration: "once" });
    expect(saved.writes).toEqual(["/products", "/prices", "/coupons"]);

    const second = run(key, state, preload);
    expect(second.code, second.err).toBe(0);
    expect(second.out).toBe(first.out);
    expect(JSON.parse(readFileSync(state, "utf8")).writes).toHaveLength(3);
  });
});
