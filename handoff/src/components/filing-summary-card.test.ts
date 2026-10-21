import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseFilingSummary } from "@/lib/filing-summary";
import { FilingSummaryCard } from "./filing-summary-card";
import { Markdown } from "./markdown";

const RAW = [
  "# Social media v2 (corrected), one filing",
  "",
  "- Kind: document",
  "- Agent: Abracadabra Client (Grok Bot teammate 3cd07aef-46af-47da-ad75-dd733168e495) (abracadabra-client)",
  "- Finished: 2026-10-21T00:48:33.083Z",
  "- Task: b3643f97-11ba-4b6d-9126-0f21b2d61793",
  "- Handed to: designer",
  "- Ref: abracadabra-client-2026-10-20-social-media-v3-one-filing",
  "",
  "## Summary",
  "",
  "Final drafts, **nothing posted** or published.",
  "",
  "## Handoff",
  "",
  "Designer: use the darker teal.",
  "",
  "## Links",
  "",
  "- [Schema (post CTA)](https://abra-ca-dabra.app/products/schema/)",
  "- [Sneaky](javascript:alert(1))",
  "",
  "## Files",
  "",
  "- facebook-posts.md",
  "- schema-1.png",
  "",
  "---",
  "",
  "# Facebook posts: drafts",
  "",
  "## Schema 1: Can AI read your site?",
  "",
  "**Image:** `schema-1.png`. **Hook:** Your next customer might ask ChatGPT.",
  "",
  "<script>alert('x')</script>",
  "<img src=x onerror=alert(1)>",
  "",
  "![tracker](https://evil.example/pixel.png)",
  "",
  "[click me](javascript:alert(2)) and [the check](https://check.abra-ca-dabra.app/check?utm_source=facebook)",
].join("\n");

/** Visible text only (attributes like <time dateTime> are machine-readable, not shown). */
function visible(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function render(viewer: "client" | "staff") {
  const summary = parseFilingSummary(RAW)!;
  return renderToStaticMarkup(
    createElement(FilingSummaryCard, {
      summary,
      viewer,
      raw: viewer === "staff" ? RAW : undefined,
      fileLinks: { "schema-1.png": "#item-abc", "facebook-posts.md": "#item-def" },
      fileCount: 2,
    }),
  );
}

describe("FilingSummaryCard for a client", () => {
  const html = render("client");
  const text = visible(html);

  it("shows a title, a Toronto Delivered date and the rendered summary", () => {
    expect(html).toContain("Social media v2 (corrected), one filing</h2>");
    expect(text).toContain("Delivered Oct 20, 2026 · 8:48 PM EDT");
    expect(html).toContain("<strong>nothing posted</strong>");
    expect(text).toContain("2 files below");
    expect(text).toContain("Show details");
    expect(html).toContain("<details");
  });

  it("strips internal metadata", () => {
    for (const hidden of [
      "3cd07aef-46af-47da-ad75-dd733168e495",
      "abracadabra-client",
      "Grok Bot teammate",
      "b3643f97-11ba-4b6d-9126-0f21b2d61793",
      "Ref:",
      "Task:",
      "Finished:",
      "Kind:",
      "Handed to",
      "2026-10-21T00:48:33.083Z",
      "Designer: use the darker teal.",
      "Details for staff",
    ]) {
      expect(text).not.toContain(hidden);
    }
    expect(html).not.toContain("abracadabra-client-2026-10-20-social-media-v3-one-filing");
  });

  it("does not repeat the Files list or show raw markdown", () => {
    expect(text).not.toContain("facebook-posts.md");
    expect(text).not.toMatch(/(^| )#{1,3} /);
    expect(text).not.toContain("**");
    expect(text).not.toContain("](");
  });

  it("renders the details as markdown and links file names to the files", () => {
    expect(html).toContain("Facebook posts: drafts</h1>");
    expect(html).toContain("Schema 1: Can AI read your site?</h2>");
    expect(html).toContain('<a href="#item-abc" class="underline-offset-4 hover:underline" data-file-link="true"><code>schema-1.png</code></a>');
  });

  it("is sanitized: no raw HTML, scripts, unsafe links or outside images", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(text).toContain("[tracker]");
    expect(text).toContain("click me");
    // The unsafe link pill is dropped; the safe one opens in a new tab without a referrer.
    expect(text).not.toContain("Sneaky");
    expect(html).toMatch(/<a href="https:\/\/abra-ca-dabra.app\/products\/schema\/" target="_blank" rel="noopener noreferrer"/);
    expect(html).toMatch(/<a href="https:\/\/check.abra-ca-dabra.app\/check\?utm_source=facebook" target="_blank" rel="noreferrer"/);
  });
});

describe("FilingSummaryCard for staff", () => {
  const html = render("staff");
  const text = visible(html);

  it("keeps the client card and adds Details for staff with the raw metadata", () => {
    expect(text).toContain("Delivered Oct 20, 2026 · 8:48 PM EDT");
    expect(text).toContain("Details for staff");
    expect(text).toContain("Clients don&#x27;t see this part.");
    expect(text).toContain("3cd07aef-46af-47da-ad75-dd733168e495");
    expect(text).toContain("b3643f97-11ba-4b6d-9126-0f21b2d61793");
    expect(text).toContain("abracadabra-client-2026-10-20-social-media-v3-one-filing");
    expect(text).toContain("2026-10-21T00:48:33.083Z");
    expect(text).toContain("Designer: use the darker teal.");
    expect(text).toContain("facebook-posts.md, schema-1.png");
    // The raw page is escaped text, never HTML.
    expect(html).toContain("&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;");
    expect(html).not.toContain("<script");
  });
});

describe("Markdown", () => {
  it("still shows images by default (chat) and drops raw HTML", () => {
    const html = renderToStaticMarkup(createElement(Markdown, null, "![chart](https://hq.example/chart.png)\n\n<b>bold</b>"));
    expect(html).toContain('<img src="https://hq.example/chart.png" alt="chart"');
    expect(html).not.toContain("<b>");
  });

  it("keeps in-app and mailto links, drops other schemes", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, null, "[home](/w/acme) [mail](mailto:hi@example.com) [data](data:text/html,hi) [vb](vbscript:x)"),
    );
    expect(html).toContain('href="/w/acme"');
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("vbscript:");
  });
});
