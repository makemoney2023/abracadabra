import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_ORIGIN, homeRedirectPath, schemaUrl } from "@/lib/hosts";

const repoRoot = path.resolve(__dirname, "../../..");

describe("schema host", () => {
  const previousCheck = process.env.NEXT_PUBLIC_CHECK_URL;
  const previousSchema = process.env.NEXT_PUBLIC_SCHEMA_URL;

  afterEach(() => {
    if (previousCheck === undefined) delete process.env.NEXT_PUBLIC_CHECK_URL;
    else process.env.NEXT_PUBLIC_CHECK_URL = previousCheck;
    if (previousSchema === undefined) delete process.env.NEXT_PUBLIC_SCHEMA_URL;
    else process.env.NEXT_PUBLIC_SCHEMA_URL = previousSchema;
  });

  it("sends only the readiness-check hostname home to /check", () => {
    process.env.NEXT_PUBLIC_CHECK_URL = "https://check.abra-ca-dabra.app";
    expect(homeRedirectPath("check.abra-ca-dabra.app", "/")).toBe("/check");
    expect(homeRedirectPath("schema.abra-ca-dabra.app", "/")).toBeNull();
    expect(homeRedirectPath("localhost:3000", "/")).toBeNull();
    expect(homeRedirectPath("check.abra-ca-dabra.app", "/scan/abc")).toBeNull();
  });

  it("uses the Cloudflare schema origin when the public URL is unset", () => {
    delete process.env.NEXT_PUBLIC_SCHEMA_URL;
    expect(schemaUrl()).toBe(SCHEMA_ORIGIN);
    expect(SCHEMA_ORIGIN).toBe("https://schema.abra-ca-dabra.app");
  });

  it("paints Schema with the marketing nav, type, and vermilion ink", () => {
    const css = readFileSync(path.join(repoRoot, "readiness-check/src/app/globals.css"), "utf8");
    const shell = css.slice(css.indexOf(".schema-studio"));
    expect(shell).toContain(".schema-nav");
    expect(shell).toContain("display: none");
    expect(css).toContain("color: #170804");
    expect(css).toContain('"Inter Tight"');
  });

  it("keeps marketing, discovery, and the specimen off the Vercel app", () => {
    const files = [
      "scrollcraft/builds/abracadabra-ai/scripts/site-data.mjs",
      "scrollcraft/builds/abracadabra-ai/scripts/blog.mjs",
      "scrollcraft/builds/abracadabra-ai/scripts/llms-discovery.mjs",
      "scrollcraft/builds/abracadabra-ai/walkthrough.html",
      "scrollcraft/builds/abracadabra-ai/index.html",
      "scrollcraft/builds/abracadabra-ai/products/schema/index.html",
      "scrollcraft/builds/abracadabra-ai/portfolio/schema/index.html",
      "scrollcraft/builds/abracadabra-ai/about/index.html",
      "scrollcraft/builds/abracadabra-ai/llms.txt",
      "scrollcraft/builds/abracadabra-ai/llms-full.txt",
      "docs/source-of-truth.md",
      "readiness-check/src/lib/assessment/config.v1.json",
    ];
    for (const file of files) {
      const text = readFileSync(path.join(repoRoot, file), "utf8");
      expect(text, file).not.toContain("schema-two.vercel.app");
      expect(text, file).toContain("https://schema.abra-ca-dabra.app");
    }
  });
});
