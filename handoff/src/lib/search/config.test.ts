import { describe, expect, it } from "vitest";
import { searchConsoleConfig } from "./config";
import { throwawayServiceAccount } from "./test-key";

describe("searchConsoleConfig", () => {
  it("fails closed: off unless the flag is on, then needs a parseable key", async () => {
    const { json } = await throwawayServiceAccount();
    expect(searchConsoleConfig(undefined)).toEqual({ ok: false, reason: "off" });
    expect(searchConsoleConfig({ GOOGLE_SA_KEY_JSON: json })).toEqual({ ok: false, reason: "off" });
    expect(searchConsoleConfig({ SEARCH_CONSOLE: "off", GOOGLE_SA_KEY_JSON: json })).toEqual({ ok: false, reason: "off" });
    expect(searchConsoleConfig({ SEARCH_CONSOLE: "on" })).toEqual({ ok: false, reason: "missing_key" });
    expect(searchConsoleConfig({ SEARCH_CONSOLE: "on", GOOGLE_SA_KEY_JSON: "  " })).toEqual({ ok: false, reason: "missing_key" });
    expect(searchConsoleConfig({ SEARCH_CONSOLE: "on", GOOGLE_SA_KEY_JSON: "{oops" })).toEqual({ ok: false, reason: "invalid_key" });
    const ready = searchConsoleConfig({ SEARCH_CONSOLE: "true", GOOGLE_SA_KEY_JSON: json });
    expect(ready.ok).toBe(true);
  });

  it("never echoes the raw secret in a failure", () => {
    const secret = '{"private_key":"-----BEGIN PRIVATE KEY-----SECRET"}';
    expect(JSON.stringify(searchConsoleConfig({ SEARCH_CONSOLE: "1", GOOGLE_SA_KEY_JSON: secret }))).not.toContain("SECRET");
  });
});
