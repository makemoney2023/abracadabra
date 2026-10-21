import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  cleanPostBody,
  isUsefulLlms,
  mdEntry,
  slugLabel,
  buildDiscoveryFiles,
} from "../scripts/llms-discovery.mjs";
import { loadPosts, isPublic, asOf } from "../scripts/blog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function text(name) {
  return readFile(join(root, name), "utf8");
}

describe("llms discovery files", () => {
  it("slugLabel sentence-cases service slugs", () => {
    assert.equal(slugLabel("voice-and-realtime-agents"), "Voice and realtime agents");
    assert.equal(slugLabel("mcp-connectors"), "MCP connectors");
    assert.equal(slugLabel("ai-assistants-and-agents"), "AI assistants and agents");
  });

  it("mdEntry emits llmstxt.org list links", () => {
    assert.equal(
      mdEntry("Voice and realtime agents", "https://abra-ca-dabra.app/services/voice-and-realtime-agents/", "AI that answers your phone."),
      "- [Voice and realtime agents](https://abra-ca-dabra.app/services/voice-and-realtime-agents/): AI that answers your phone.",
    );
  });

  it("cleanPostBody strips placeholders and resolves footnotes", () => {
    const post = {
      slug: "sample",
      body: "Claim.[^nist]\n\n<!--image:2-->\n\nMore.\n\n<!--cta:inline-->\n\nSee [note](/blog/sample).",
      citations: [
        {
          id: "nist",
          title: "NIST AI RMF",
          url: "https://example.com/nist",
          publisher: "NIST",
          datePublished: "2023-01-26",
        },
      ],
    };
    const cleaned = cleanPostBody(post, { maxChars: 0 });
    assert.doesNotMatch(cleaned, /<!--/);
    assert.doesNotMatch(cleaned, /\[\^/);
    assert.match(cleaned, /\(NIST, 2023\)/);
    assert.match(cleaned, /https:\/\/abra-ca-dabra\.app\/blog\/sample/);
  });

  it("committed llms.txt and llms-full.txt are useful and clean", async () => {
    const llms = await text("llms.txt");
    const full = await text("llms-full.txt");
    assert.equal(isUsefulLlms(llms), true);
    assert.equal(isUsefulLlms(full), true);
    for (const [name, body] of [
      ["llms.txt", llms],
      ["llms-full.txt", full],
    ]) {
      assert.doesNotMatch(body, /<!--/, `${name} has an HTML comment`);
      assert.doesNotMatch(body, /\[\^[a-z0-9-]+\]/, `${name} has a footnote marker`);
      assert.doesNotMatch(body, /Do not mention CTR/);
      assert.doesNotMatch(body, /Rules for quoting/);
    }
    const listLines = llms.split("\n").filter((line) => line.startsWith("- "));
    assert.ok(listLines.length > 20);
    for (const line of listLines) {
      assert.match(line, /^- \[[^\]]+\]\(https:\/\/[^)]+\): /, line);
    }
    assert.match(llms, /## Optional/);
    assert.match(llms, /\[llms-full\.txt\]\(https:\/\/abra-ca-dabra\.app\/llms-full\.txt\)/);
    assert.match(llms, /\[Voice and realtime agents\]\(https:\/\/abra-ca-dabra\.app\/services\/voice-and-realtime-agents\/\): AI that answers your phone\./);
    assert.match(llms, /Last updated: \d{4}-\d{2}-\d{2}/);
    assert.match(full, /## Overview/);
    assert.match(full, /## Services/);
    assert.match(full, /## Portfolio/);
    assert.match(full, /## Products and course/);
    assert.match(full, /## How a project works/);
    assert.match(full, /## Blog posts/);
    assert.match(full, /398K/);
  });

  it("builder output stays useful for the live post set", async () => {
    const posts = (await loadPosts()).filter((post) => isPublic(post));
    const { llmsTxt, llmsFullTxt } = buildDiscoveryFiles({ posts, updated: asOf() });
    assert.equal(isUsefulLlms(llmsTxt), true);
    assert.equal(isUsefulLlms(llmsFullTxt), true);
    assert.doesNotMatch(llmsFullTxt, /<!--image:|<!--cta:|\[\^/);
  });
});
