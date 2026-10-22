import { describe, expect, it } from "vitest";
import { appendSent, feedbackReturnPath } from "./return-path";

describe("feedback return path", () => {
  it("stays on this client's social page or finished work", () => {
    expect(feedbackReturnPath("acme", "/w/acme/social", false)).toBe("/w/acme/social");
    expect(feedbackReturnPath("acme", "/w/acme/work/d-1", false)).toBe("/w/acme/work/d-1");
    expect(feedbackReturnPath("acme", "/w/other/social", false)).toBeNull();
    expect(feedbackReturnPath("acme", "https://evil.example/w/acme/social", false)).toBeNull();
    expect(feedbackReturnPath("acme", "//evil.example", false)).toBeNull();
    expect(feedbackReturnPath("acme", "", false)).toBeNull();
  });

  it("lets staff return to the client profile social tab only", () => {
    expect(feedbackReturnPath("acme", "/clients/org-1?tab=social", true)).toBe("/clients/org-1?tab=social");
    expect(feedbackReturnPath("acme", "/clients/org-1?tab=social", false)).toBeNull();
    expect(feedbackReturnPath("acme", "/clients/org-1?tab=work", true)).toBeNull();
    expect(feedbackReturnPath("acme", "/clients/org-1", true)).toBeNull();
  });

  it("adds the confirmation without dropping an existing query", () => {
    expect(appendSent("/w/acme/social", "approved")).toBe("/w/acme/social?sent=approved");
    expect(appendSent("/clients/org-1?tab=social", "changes")).toBe("/clients/org-1?tab=social&sent=changes");
  });
});
