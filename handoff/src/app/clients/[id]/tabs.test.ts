import { describe, expect, it } from "vitest";
import { CLIENT_TABS, activeTab, tabHref } from "./tabs";

describe("client tabs", () => {
  it("lists Overview, Work, Threads, Files & spaces, Repos, Activity, and Settings", () => {
    expect(CLIENT_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Work",
      "Threads",
      "Files & spaces",
      "Repos",
      "Activity",
      "Settings",
    ]);
  });

  it("falls back to overview for an unknown tab", () => {
    expect(activeTab(undefined)).toBe("overview");
    expect(activeTab("nope")).toBe("overview");
    expect(activeTab("")).toBe("overview");
    expect(activeTab("work")).toBe("work");
    expect(activeTab("files")).toBe("files");
  });

  it("keeps the tab in the link and only pages the activity tab", () => {
    expect(tabHref("ada", "overview")).toBe("/clients/ada");
    expect(tabHref("ada", "overview", 2)).toBe("/clients/ada");
    expect(tabHref("ada", "work")).toBe("/clients/ada?tab=work");
    expect(tabHref("ada", "activity", 1)).toBe("/clients/ada?tab=activity");
    expect(tabHref("ada", "activity", 2)).toBe("/clients/ada?tab=activity&page=2");
  });
});
