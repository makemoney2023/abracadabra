import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import { BANNED, FORBIDDEN_CLAIMS, isPublic, loadPosts } from "../scripts/blog.mjs";

const root = new URL("..", import.meta.url).pathname;

async function text(path) {
  return readFile(join(root, path), "utf8");
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quoted) {
      if (char === '"' && raw[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((entry) => entry.some((value) => value.length));
  const slug = header.indexOf("slug");
  return body.map((entry) => entry[slug]);
}

function graph(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "missing JSON-LD");
  return JSON.parse(match[1])["@graph"];
}

describe("blog content", () => {
  it("validates frontmatter, three images, and sourced numbers", async () => {
    const posts = await loadPosts();
    assert.equal(posts.length, 24);
    for (const post of posts) {
      assert.equal(post.images.length, 3);
      assert.ok(post.images.every((image) => image.alt.trim().length >= 12));
      assert.ok(post.faqs.length >= 3);
      assert.ok(post.citations.length >= 1);
      assert.match(post.description, /^.{110,165}$/);
      assert.ok(post.title.length <= 70);
    }
  });

  it("gives every calendar slug three image prompts", async () => {
    const slugs = parseCsv(await text("content/content-calendar.csv"));
    const prompts = JSON.parse(await text("content/calendar-image-prompts.json"));
    assert.equal(slugs.length, 24);
    assert.equal(new Set(slugs).size, 24);
    for (const slug of slugs) {
      assert.equal(prompts[slug]?.length, 3, slug);
      assert.ok(prompts[slug].every((prompt) => prompt.trim().length >= 40));
    }
  });

  it("publishes 1200×630 previews with alt text", async () => {
    const posts = await loadPosts();
    const stamp = JSON.parse(await text("blog/build-stamp.json"));
    const pages = [
      ["blog/index.html", "blog/og/index.png", "Abracadabra AI blog — notes on AI for operators"],
      ["about/christopher-buzny/index.html", "blog/og/author.png", "Christopher Buzny, founder of Abracadabra AI"],
      ...posts.map((post) => [
        `blog/${post.slug}/index.html`,
        `blog/og/${post.slug}.png`,
        `${post.title} — Abracadabra AI`,
      ]),
    ];
    for (const [page, image, alt] of pages) {
      const html = await text(page);
      const meta = await sharp(join(root, image)).metadata();
      assert.equal(meta.width, 1200, image);
      assert.equal(meta.height, 630, image);
      assert.match(html, new RegExp(`<meta property="og:image" content="https://abra-ca-dabra\\.app/${image}">`));
      assert.match(html, /<meta property="og:image:width" content="1200">/);
      assert.match(html, /<meta property="og:image:height" content="630">/);
      assert.match(html, new RegExp(`<meta property="og:image:alt" content="${alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
      assert.match(html, new RegExp(`<meta name="twitter:image:alt" content="${alt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}">`));
    }
    assert.match(stamp.asOf, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes future posts only when BLOG_PREVIEW is set", () => {
    const future = { datePublished: "2099-01-01" };
    const past = { datePublished: "2020-01-01" };
    const previous = process.env.BLOG_PREVIEW;
    delete process.env.BLOG_PREVIEW;
    try {
      assert.equal(isPublic(future, "2026-10-14"), false);
      assert.equal(isPublic(past, "2026-10-14"), true);
      process.env.BLOG_PREVIEW = "1";
      assert.equal(isPublic(future, "2026-10-14"), true);
      process.env.BLOG_PREVIEW = "0";
      assert.equal(isPublic(future, "2026-10-14"), false);
    } finally {
      if (previous === undefined) delete process.env.BLOG_PREVIEW;
      else process.env.BLOG_PREVIEW = previous;
    }
  });

  it("hides future posts from the public surfaces and keeps their pages reviewable", async () => {
    const posts = await loadPosts();
    const stamp = JSON.parse(await text("blog/build-stamp.json"));
    const index = await text("blog/index.html");
    const sitemap = await text("sitemap.xml");
    const rss = await text("blog/rss.xml");
    const llms = await text("llms.txt");
    const liveBlock = llms.match(/<!-- blog-live:start -->([\s\S]*?)<!-- blog-live:end -->/)?.[1] ?? "";
    for (const post of posts) {
      const html = await text(`blog/${post.slug}/index.html`);
      const listed = post.datePublished <= stamp.asOf;
      const loc = `https://abra-ca-dabra.app/blog/${post.slug}`;
      if (listed) {
        assert.match(index, new RegExp(post.slug));
        assert.match(sitemap, new RegExp(loc.replaceAll(".", "\\.")));
        assert.match(rss, new RegExp(loc.replaceAll(".", "\\.")));
        assert.match(liveBlock, new RegExp(loc.replaceAll(".", "\\.")));
        assert.match(html, /index,follow/);
      } else {
        assert.doesNotMatch(index, new RegExp(`/blog/${post.slug}`));
        assert.doesNotMatch(sitemap, new RegExp(loc.replaceAll(".", "\\.")));
        assert.doesNotMatch(rss, new RegExp(`<link>${loc.replaceAll(".", "\\.")}</link>`));
        assert.doesNotMatch(liveBlock, new RegExp(loc.replaceAll(".", "\\.")));
        assert.match(html, /noindex,nofollow/);
      }
    }
    assert.match(sitemap, /<loc>https:\/\/abra-ca-dabra\.app\/blog<\/loc>/);
    assert.match(sitemap, /films\.html[\s\S]*<lastmod>2026-10-07<\/lastmod>/);
  });

  it("ships BlogPosting, breadcrumbs, FAQ, citations, and check CTAs", async () => {
    const posts = await loadPosts();
    const slugs = new Set(posts.map((post) => post.slug));
    const calendar = parseCsv(await text("content/content-calendar.csv"));
    for (const post of posts) {
      const html = await text(`blog/${post.slug}/index.html`);
      const nodes = graph(html);
      const article = nodes.find((node) => node["@type"] === "BlogPosting");
      assert.ok(article);
      assert.equal(article.image.length, 3);
      assert.ok(article.citation.every((item) => item["@type"] === "CreativeWork"));
      assert.ok(nodes.some((node) => node["@type"] === "BreadcrumbList"));
      assert.ok(nodes.some((node) => node["@type"] === "FAQPage"));
      assert.match(html, /<nav class="crumbs"/);
      assert.match(html, /<section id="sources">/);
      assert.match(html, /<section id="faq">/);
      for (const placement of ["inline", "sticky", "close"]) {
        const href = `https://check.abra-ca-dabra.app/check?utm_source=blog&amp;utm_medium=cta&amp;utm_campaign=${post.slug}&amp;utm_content=${placement}`;
        assert.match(html, new RegExp(`data-track="readiness_cta_clicked"[^>]*data-track-placement="${placement}"[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      }
      const prose = `${post.title}\n${post.description}\n${post.body}`;
      for (const pattern of BANNED) assert.doesNotMatch(prose, pattern);
      for (const claim of FORBIDDEN_CLAIMS) assert.equal(prose.includes(claim), false, claim);
      const others = [...slugs].filter((slug) => slug !== post.slug);
      assert.ok(others.every((slug) => html.includes(`/blog/${slug}`)));
      assert.match(html, /href="\/about\/christopher-buzny"/);
      assert.match(html, /href="\/"/);
      for (const slug of calendar) {
        if (!slugs.has(slug)) assert.equal(html.includes(`/blog/${slug}`), false, slug);
      }
    }
  });

  it("blocks training crawlers and keeps the privacy draft offline", async () => {
    const robots = await text("robots.txt");
    assert.match(robots, /User-agent: CCBot\nDisallow: \//);
    assert.match(robots, /User-agent: Bytespider\nDisallow: \//);
    assert.match(robots, /User-agent: GPTBot\nAllow: \//);
    assert.match(robots, /User-agent: ClaudeBot\nAllow: \//);
    assert.match(robots, /Sitemap: https:\/\/abra-ca-dabra\.app\/sitemap\.xml/);
    const privacy = await text("privacy/index.html");
    assert.match(privacy, /Draft for review/);
    assert.match(privacy, /noindex,nofollow/);
    assert.match(privacy, /after a visitor consents/);
    assert.doesNotMatch(privacy, /<script[^>]+posthog/i);
    assert.doesNotMatch(privacy, /posthog\.com/);
    const llms = await text("llms.txt");
    assert.match(llms, /Privacy draft \(not in force\)/);
    assert.match(llms, /No post is public on this date|https:\/\/abra-ca-dabra\.app\/blog\//);
  });
});
