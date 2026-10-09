import { describe, expect, it } from "vitest";

import type { VisibleInstall } from "@/lib/github/app";

import { repoTableRows } from "./rows";

const installs: VisibleInstall[] = [
  {
    id: 7,
    accountLogin: "abracadabra",
    accountType: "Organization",
    suspended: false,
    repos: [
      { id: 9, fullName: "abracadabra/handoff", isPrivate: true, defaultBranch: "main" },
      { id: 10, fullName: "not a repo", isPrivate: true, defaultBranch: "main" },
    ],
  },
  {
    id: 8,
    accountLogin: "old",
    accountType: "Organization",
    suspended: true,
    repos: [],
  },
];

describe("repoTableRows", () => {
  it("links a stored client and leaves an unknown repo blank", () => {
    const rows = repoTableRows(installs, [
      { githubRepoId: 9, organizationId: "org-1", client: "Acme", lastAt: 50 },
    ]);
    expect(rows).toEqual([
      {
        id: 9,
        fullName: "abracadabra/handoff",
        href: "https://github.com/abracadabra/handoff",
        client: "Acme",
        clientHref: "/clients/org-1",
        lastAt: 50,
      },
      {
        id: 10,
        fullName: "not a repo",
        href: "",
        client: "",
        clientHref: "",
        lastAt: null,
      },
    ]);
  });

  it("uses an ellipsis when the linked client has no name", () => {
    const rows = repoTableRows(installs, [
      { githubRepoId: 9, organizationId: "org-1", client: "  ", lastAt: null },
    ]);
    expect(rows[0]?.client).toBe("…");
    expect(rows[0]?.clientHref).toBe("/clients/org-1");
    expect(rows[0]?.lastAt).toBeNull();
  });
});
