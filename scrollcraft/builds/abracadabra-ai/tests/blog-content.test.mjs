import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import { BANNED, FORBIDDEN_CLAIMS, isPublic, loadPosts } from "../scripts/blog.mjs";

const root = new URL("..", import.meta.url).pathname;

async function text(path) {
  return readFile(join(root, path), "utf8");
}

function escAttr(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
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
    const posts = await loadPosts();
    const supplied = JSON.parse(await text("content/blog/body-alt.json"));
    const altBySlot = new Map(supplied.map((entry) => [`${entry.slug}:${entry.slot}`, entry.alt]));
    const alts = [];
    for (const post of posts) {
      post.images.forEach((image, index) => {
        assert.equal(prompts[post.slug][index], image.prompt, post.slug);
        if (index === 0) assert.ok(image.alt.length >= 40, image.alt);
        alts.push(image.alt);
      });
      assert.equal(post.images[1].alt, altBySlot.get(`${post.slug}:body1`), post.slug);
      assert.equal(post.images[2].alt, altBySlot.get(`${post.slug}:body2`), post.slug);
    }
    assert.equal(new Set(alts).size, alts.length);
  });

  it("serves each hero photograph as webp with a jpg fallback", async () => {
    const posts = await loadPosts();
    const index = await text("blog/index.html");
    for (const post of posts) {
      const html = await text(`blog/${post.slug}/index.html`);
      const webp = `/blog/media/${post.slug}/01.webp`;
      const jpg = `/blog/media/${post.slug}/01.jpg`;
      assert.equal(post.images[0].src, webp);
      const tag = `<picture><source srcset="${webp}" type="image/webp"><img src="${jpg}"`;
      assert.ok(html.includes(tag), post.slug);
      assert.ok(index.includes(tag), post.slug);
      const webpMeta = await sharp(join(root, webp.slice(1))).metadata();
      const jpgMeta = await sharp(join(root, jpg.slice(1))).metadata();
      assert.equal(webpMeta.format, "webp", post.slug);
      assert.equal(webpMeta.width, 1280, post.slug);
      assert.equal(webpMeta.height, 720, post.slug);
      assert.equal(jpgMeta.format, "jpeg", post.slug);
      assert.equal(jpgMeta.width, 1280, post.slug);
      assert.equal(jpgMeta.height, 720, post.slug);
    }
  });

  it("serves each in-article photograph as webp with the supplied alt", async () => {
    const posts = await loadPosts();
    const supplied = JSON.parse(await text("content/blog/body-alt.json"));
    const altBySlot = new Map(supplied.map((entry) => [`${entry.slug}:${entry.slot}`, entry.alt]));
    for (const post of posts) {
      const html = await text(`blog/${post.slug}/index.html`);
      for (const [slot, name] of [["body1", "02"], ["body2", "03"]]) {
        const webp = `/blog/media/${post.slug}/${name}.webp`;
        const jpg = `/blog/media/${post.slug}/${name}.jpg`;
        const image = slot === "body1" ? post.images[1] : post.images[2];
        const alt = altBySlot.get(`${post.slug}:${slot}`);
        assert.equal(image.src, webp, post.slug);
        assert.equal(image.alt, alt, post.slug);
        assert.equal(image.caption, undefined, post.slug);
        const tag = `<picture><source srcset="${webp}" type="image/webp"><img src="${jpg}" alt="${escAttr(alt)}" width="1280" height="720">`;
        assert.ok(html.includes(tag), `${post.slug} ${slot}`);
        assert.equal(html.includes(`<figure class="post-figure"><img src="/blog/media/${post.slug}/${name}.png"`), false);
        for (const file of [webp, jpg]) {
          const meta = await sharp(join(root, file.slice(1))).metadata();
          assert.equal(meta.width, 1280, file);
          assert.equal(meta.height, 720, file);
        }
        assert.equal(existsSync(join(root, `blog/media/${post.slug}/${name}.png`)), false, post.slug);
      }
      assert.equal(html.includes("/02.png"), false, post.slug);
      assert.equal(html.includes("/03.png"), false, post.slug);
    }
  });

  it("publishes 1200×630 previews with alt text", async () => {
    const posts = await loadPosts();
    const stamp = JSON.parse(await text("blog/build-stamp.json"));
    const pages = [
      ["blog/index.html", "blog/og/index.jpg", "Abracadabra AI blog — notes on AI for operators"],
      ["about/index.html", "blog/og/author.jpg", "About Abracadabra"],
      ...posts.map((post) => [
        `blog/${post.slug}/index.html`,
        `blog/og/${post.slug}.jpg`,
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
    assert.match(sitemap, /films\.html[\s\S]*<lastmod>2026-10-19<\/lastmod>/);
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
      assert.match(html, /href="\/about\/"/);
      assert.match(html, /By <a href="\/about\/">Abracadabra Studio<\/a>/);
      assert.match(html, /<meta name="author" content="Abracadabra Studio">/);
      assert.match(html, /"@type": "Organization",\s*"@id": "[^"]+#studio",\s*"name": "Abracadabra Studio",\s*"url": "https:\/\/abra-ca-dabra.app"/);
      assert.equal(/christopher|buzny|"Person"/i.test(html), false);
      assert.match(html, /href="\/"/);
      for (const slug of calendar) {
        if (!slugs.has(slug)) assert.equal(html.includes(`/blog/${slug}`), false, slug);
      }
    }
  });

  it("gives the index a featured note, a pillar filter, and a date plus reading time on every card", async () => {
    const posts = await loadPosts();
    const index = await text("blog/index.html");
    assert.match(index, /<a class="featured-post" data-pillar="AI readiness" href="\/blog\/ai-readiness-assessment">/);
    assert.match(index, /<fieldset class="pillar-filter"><legend>Filter by topic<\/legend>/);
    assert.match(index, /<input type="radio" name="pillar" id="pillar-all" checked>/);
    const times = index.match(/<time datetime="2026-10-14">October 14, 2026<\/time>/g) ?? [];
    const reads = index.match(/\d+ min read/g) ?? [];
    assert.equal(times.length, posts.length);
    assert.equal(reads.length, posts.length);
    for (const post of posts) {
      assert.match(index, new RegExp(`data-pillar="${post.pillar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      assert.ok(index.includes(`>${post.pillar}</label>`) || post.pillar === "AI readiness", post.pillar);
      assert.ok(index.includes(`/blog/${post.slug}`), post.slug);
    }
    const pillars = [...new Set(posts.map((post) => post.pillar))];
    for (const pillar of pillars) {
      assert.ok(index.includes(`>${pillar}</label>`), pillar);
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
    assert.match(privacy, /Effective date/);
    assert.match(privacy, /noindex,nofollow/);
    assert.match(privacy, /only after you consent/);
    assert.doesNotMatch(privacy, /<script[^>]+posthog/i);
    assert.doesNotMatch(privacy, /posthog\.com/);
    const llms = await text("llms.txt");
    assert.match(llms, /Privacy: /);
    assert.match(llms, /No post is public on this date|https:\/\/abra-ca-dabra\.app\/blog\//);
  });
});
