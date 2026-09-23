import { describe, expect, it } from "vitest";
import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import { analyzeRobots } from "@/lib/detect/robots";
import { detectJsonLd } from "@/lib/detect/jsonld";
import { parseSitemapUrls } from "@/lib/detect/sitemap";
import {
  generateFixPackage,
  listFixOptions,
  type FixPackageInput,
} from "@/lib/fixes/generate-package";

const cambridgeInput: FixPackageInput = {
  domain: "cambridgechamber.com",
  origin: "https://cambridgechamber.com",
  businessName: "Cambridge Chamber of Commerce",
  findings: [
    {
      code: "NO_JSON_LD_HOME",
      passed: false,
      message: "Home page is missing JSON-LD structured data.",
    },
    {
      code: "NO_ORG_SCHEMA",
      passed: false,
      message: "Home page is missing Organization/LocalBusiness schema.",
    },
    {
      code: "MISSING_FAQ_SCHEMA",
      passed: false,
      message: "No FAQ schema detected across scanned pages.",
    },
    {
      code: "SITEMAP_MISSING",
      passed: false,
      message: "sitemap.xml is missing.",
    },
    {
      code: "EMPTY_LLMS_TXT",
      passed: false,
      message: "llms.txt is present but not useful.",
    },
    {
      code: "LOW_JSON_LD_COVERAGE",
      passed: false,
      message: "Less than half of scanned pages have JSON-LD.",
    },
  ],
  pages: [
    {
      url: "https://cambridgechamber.com/",
      pageType: "home",
      fetchStatus: "ok",
      hasJsonLd: false,
    },
    {
      url: "https://cambridgechamber.com/about",
      pageType: "about",
      fetchStatus: "ok",
      hasJsonLd: false,
    },
    {
      url: "https://cambridgechamber.com/contact",
      pageType: "contact",
      fetchStatus: "ok",
      hasJsonLd: false,
    },
    {
      url: "https://cambridgechamber.com/blog/news",
      pageType: "blog",
      fetchStatus: "ok",
      hasJsonLd: false,
    },
    {
      url: "https://cambridgechamber.com/private",
      pageType: "other",
      fetchStatus: "failed",
      hasJsonLd: false,
    },
  ],
};

describe("listFixOptions", () => {
  it("lists site-file, FAQ, and every ok page missing JSON-LD", () => {
    const { options, defaultSelection } = listFixOptions(cambridgeInput);

    expect(options.some((o) => o.id === "llmsTxt")).toBe(true);
    expect(options.some((o) => o.id === "sitemapXml")).toBe(true);
    expect(options.some((o) => o.id === "faqJsonLd")).toBe(true);
    expect(options.filter((o) => o.kind === "pageSchema")).toHaveLength(4);
    expect(defaultSelection.pageUrls).toEqual(
      expect.arrayContaining([
        "https://cambridgechamber.com/",
        "https://cambridgechamber.com/about",
        "https://cambridgechamber.com/contact",
        "https://cambridgechamber.com/blog/news",
      ]),
    );
    expect(defaultSelection.pageUrls).not.toContain(
      "https://cambridgechamber.com/private",
    );
  });

  it("auto-sets Organization for board of trade / chamber sites without LocalBusiness address gate", () => {
    const botInput: FixPackageInput = {
      domain: "bot.com",
      origin: "https://bot.com",
      businessName: "bot.com",
      findings: [],
      pages: [
        {
          url: "https://bot.com/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          evidence: {
            businessName: "Toronto Region Board of Trade",
            description:
              "As the chamber of commerce for Canada’s largest regional economy, we convene leaders.",
            emails: [],
            phones: [],
            sameAs: [],
            faqPairs: [],
            reviews: [],
            howtoSteps: [],
            hasSiteSearch: false,
            existingTypes: [],
            existingBlocks: [],
            address: {
              streetAddress: "100 Queens Quay East",
              addressLocality: "Toronto",
              addressRegion: "ON",
              addressCountry: "CA",
            },
          },
        },
      ],
    };

    const { prefills } = listFixOptions(botInput);
    expect(prefills.businessName).toBe("Toronto Region Board of Trade");
    expect(prefills.businessType).toBe("Organization");
    expect(prefills.businessTypeAuto).toBe(true);
    expect(prefills.businessTypeLabel).toMatch(/board of trade|chamber/i);
  });

  it("prefills sameAs profile URLs and opening hours from page evidence", () => {
    const input: FixPackageInput = {
      domain: "example.com",
      origin: "https://example.com",
      findings: [],
      pages: [
        {
          url: "https://example.com/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          evidence: {
            businessName: "Example Co",
            emails: [],
            phones: [],
            sameAs: [
              "https://www.linkedin.com/company/example",
              "https://twitter.com/example",
            ],
            faqPairs: [],
            reviews: [],
            howtoSteps: [],
            hasSiteSearch: false,
            existingTypes: [],
            existingBlocks: [],
            openingHours: ["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"],
          },
        },
      ],
    };

    const { prefills } = listFixOptions(input);
    expect(prefills.sameAs).toEqual([
      "https://www.linkedin.com/company/example",
      "https://twitter.com/example",
    ]);
    expect(prefills.openingHours).toEqual(["Mo-Fr 09:00-17:00", "Sa 10:00-14:00"]);
  });
});

describe("generateFixPackage", () => {
  it("builds downloadable artifacts for all missing pages by default", () => {
    const pkg = generateFixPackage(cambridgeInput);

    const paths = pkg.files.map((f) => f.path);
    expect(paths).toContain("INSTALL.md");
    expect(paths).toContain("llms.txt");
    expect(paths).toContain("sitemap.xml");
    expect(paths).toContain("json-ld/home.jsonld");
    expect(paths).toContain("json-ld/home.snippet.html");
    // FAQ omitted without real Q&A pairs (zero-TODO)
    expect(paths).not.toContain("json-ld/faq.jsonld");
    expect(paths).toContain("json-ld/pages/about-about.jsonld");
    expect(paths).toContain("json-ld/pages/contact-contact.jsonld");
    expect(paths).toContain("json-ld/pages/blog-blog-news.jsonld");

    const home = pkg.files.find((f) => f.path === "json-ld/home.jsonld")!.content;
    const homeDoc = JSON.parse(home) as {
      "@graph": Array<Record<string, unknown>>;
    };
    const homeDetect = detectJsonLd(
      `<script type="application/ld+json">${home}</script>`,
    );
    expect(homeDetect.schemaTypes).toEqual(
      expect.arrayContaining(["Organization", "WebSite"]),
    );
    const org = homeDoc["@graph"].find((n) => n["@type"] === "Organization")!;
    expect(org.name).toBe("Cambridge Chamber of Commerce");
    expect(org.url).toBe("https://cambridgechamber.com/");
    // Unknown optional fields are omitted (zero-TODO contract)
    expect(org.logo).toBeUndefined();
    expect(org.sameAs).toBeUndefined();
    expect(org.email).toBeUndefined();
    expect(org.description).toBeUndefined();
    expect(home).not.toMatch(/TODO_/);
    const site = homeDoc["@graph"].find((n) => n["@type"] === "WebSite")!;
    // SearchAction only when site search detected or user opts in
    expect(site.potentialAction).toBeUndefined();

    const about = pkg.files.find((f) => f.path === "json-ld/pages/about-about.jsonld")!
      .content;
    const aboutDoc = JSON.parse(about) as { "@graph": Array<Record<string, unknown>> };
    expect(aboutDoc["@graph"].map((n) => n["@type"])).toEqual(
      expect.arrayContaining(["AboutPage", "BreadcrumbList"]),
    );
    expect(aboutDoc["@graph"].find((n) => n["@type"] === "AboutPage")?.mainEntity).toEqual({
      "@id": "https://cambridgechamber.com/#organization",
    });

    const contact = pkg.files.find((f) => f.path === "json-ld/pages/contact-contact.jsonld")!
      .content;
    const contactDoc = JSON.parse(contact) as { "@graph": Array<Record<string, unknown>> };
    expect(contactDoc["@graph"].map((n) => n["@type"])).toEqual(
      expect.arrayContaining(["ContactPage", "BreadcrumbList"]),
    );
    expect(contactDoc["@graph"].find((n) => n["@type"] === "ContactPage")?.mainEntity).toMatchObject({
      "@type": "ContactPoint",
    });

    const blog = pkg.files.find((f) => f.path === "json-ld/pages/blog-blog-news.jsonld")!
      .content;
    const blogDoc = JSON.parse(blog) as { "@graph": Array<Record<string, unknown>> };
    // Listing-style blog URLs should not be BlogPosting (article schema)
    expect(blogDoc["@graph"].map((n) => n["@type"])).toEqual(
      expect.arrayContaining(["CollectionPage", "BreadcrumbList"]),
    );
    expect(blogDoc["@graph"].some((n) => n["@type"] === "BlogPosting")).toBe(false);

    const llms = pkg.files.find((f) => f.path === "llms.txt")!.content;
    expect(analyzeLlmsTxt(llms).useful).toBe(true);

    const sitemap = pkg.files.find((f) => f.path === "sitemap.xml")!.content;
    expect(parseSitemapUrls(sitemap)).toContain("https://cambridgechamber.com/");
  });

  it("respects user selection and only emits chosen artifacts", () => {
    const pkg = generateFixPackage(cambridgeInput, {
      llmsTxt: false,
      sitemapXml: true,
      faqJsonLd: false,
      robotsTxt: false,
      pageUrls: ["https://cambridgechamber.com/contact"],
    });

    const paths = pkg.files.map((f) => f.path);
    expect(paths).toContain("sitemap.xml");
    expect(paths).toContain("json-ld/pages/contact-contact.jsonld");
    expect(paths).toContain("json-ld/pages/contact-contact.snippet.html");
    expect(paths).not.toContain("llms.txt");
    expect(paths).not.toContain("json-ld/faq.jsonld");
    expect(paths).not.toContain("json-ld/home.jsonld");
    expect(paths.filter((p) => p.startsWith("json-ld/pages/")).length).toBe(2); // jsonld + snippet
  });

  it("emits AI-allowing robots.txt when crawlability findings are present", () => {
    const pkg = generateFixPackage({
      domain: "example.com",
      origin: "https://example.com",
      findings: [
        {
          code: "ROBOTS_BLOCKS_GPTBOT",
          passed: false,
          message: "robots.txt disallows GPTBot.",
        },
      ],
      pages: [],
    });

    const robots = pkg.files.find((f) => f.path === "robots.txt")!.content;
    const analyzed = analyzeRobots(robots);
    expect(analyzed.blocksGptBot).toBe(false);
    expect(robots).toMatch(/User-agent:\s*GPTBot/i);
  });

  it("returns only INSTALL.md when selection is empty", () => {
    const pkg = generateFixPackage(cambridgeInput, {
      llmsTxt: false,
      sitemapXml: false,
      faqJsonLd: false,
      robotsTxt: false,
      pageUrls: [],
    });

    expect(pkg.findingsAddressed).toEqual([]);
    expect(pkg.files.map((f) => f.path).sort()).toEqual(["INSTALL.md", "VALIDATION.md"]);
  });

  it("includes SearchAction when includeSearchAction is set", () => {
    const pkg = generateFixPackage(cambridgeInput, {
      pageUrls: ["https://cambridgechamber.com/"],
      includeSearchAction: true,
      searchUrlTemplate: "https://cambridgechamber.com/search?q={search_term_string}",
      llmsTxt: false,
      sitemapXml: false,
      robotsTxt: false,
      faqJsonLd: false,
    });
    const home = JSON.parse(
      pkg.files.find((f) => f.path === "json-ld/home.jsonld")!.content,
    ) as { "@graph": Array<Record<string, unknown>> };
    const site = home["@graph"].find((n) => n["@type"] === "WebSite")!;
    expect(site.potentialAction).toMatchObject({ "@type": "SearchAction" });
  });

  it("uses LocalBusiness when businessType override is set", () => {
    const pkg = generateFixPackage(cambridgeInput, {
      pageUrls: ["https://cambridgechamber.com/"],
      businessType: "LocalBusiness",
      llmsTxt: false,
      sitemapXml: false,
      robotsTxt: false,
      faqJsonLd: false,
    });
    const home = JSON.parse(
      pkg.files.find((f) => f.path === "json-ld/home.jsonld")!.content,
    ) as { "@graph": Array<Record<string, unknown>> };
    expect(home["@graph"].some((n) => n["@type"] === "LocalBusiness")).toBe(true);
  });

  it("emits BlogPosting only when headline is known; otherwise WebPage without TODOs", () => {
    const withoutHeadline = generateFixPackage(
      {
        ...cambridgeInput,
        findings: [{ code: "LOW_JSON_LD_COVERAGE", passed: false, message: "low" }],
        pages: [
          {
            url: "https://cambridgechamber.com/blog/2024/welcome-post",
            pageType: "blog",
            fetchStatus: "ok",
            hasJsonLd: false,
          },
        ],
      },
      {
        pageUrls: ["https://cambridgechamber.com/blog/2024/welcome-post"],
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        faqJsonLd: false,
      },
    );

    const thin = withoutHeadline.files.find(
      (f) => f.path.includes("blog-") && f.path.endsWith(".jsonld"),
    )!.content;
    expect(thin).not.toMatch(/TODO_/);
    expect(thin).not.toMatch(/BlogPosting/);

    const withHeadline = generateFixPackage(
      {
        ...cambridgeInput,
        findings: [{ code: "LOW_JSON_LD_COVERAGE", passed: false, message: "low" }],
        pages: [
          {
            url: "https://cambridgechamber.com/blog/2024/welcome-post",
            pageType: "blog",
            fetchStatus: "ok",
            hasJsonLd: false,
            evidence: {
              emails: [],
              phones: [],
              sameAs: [],
              faqPairs: [],
              hasSiteSearch: false,
              existingTypes: [],
              existingBlocks: [],
              headline: "Welcome Post",
              datePublished: "2024-01-15",
              image: "https://cambridgechamber.com/hero.jpg",
            },
          },
        ],
      },
      {
        pageUrls: ["https://cambridgechamber.com/blog/2024/welcome-post"],
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        faqJsonLd: false,
      },
    );

    const blog = withHeadline.files.find(
      (f) => f.path.includes("blog-") && f.path.endsWith(".jsonld"),
    )!.content;
    const doc = JSON.parse(blog) as { "@graph": Array<Record<string, unknown>> };
    const posting = doc["@graph"].find((n) => n["@type"] === "BlogPosting")!;
    expect(posting.headline).toBe("Welcome Post");
    expect(posting.image).toEqual({
      "@type": "ImageObject",
      url: "https://cambridgechamber.com/hero.jpg",
      contentUrl: "https://cambridgechamber.com/hero.jpg",
    });
    expect(posting.datePublished).toBe("2024-01-15");
    expect(posting.author).toMatchObject({
      "@type": "Organization",
      "@id": "https://cambridgechamber.com/#organization",
      name: "Cambridge Chamber of Commerce",
      url: "https://cambridgechamber.com/",
    });
    expect(blog).not.toMatch(/TODO_/);
  });

  it("emits Service schema for service pages without inventing prices", () => {
    const pkg = generateFixPackage(
      {
        domain: "example.com",
        origin: "https://example.com",
        findings: [{ code: "LOW_JSON_LD_COVERAGE", passed: false, message: "low" }],
        pages: [
          {
            url: "https://example.com/services",
            pageType: "service",
            fetchStatus: "ok",
            hasJsonLd: false,
          },
        ],
      },
      {
        pageUrls: ["https://example.com/services"],
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        faqJsonLd: false,
      },
    );
    const json = pkg.files.find((f) => f.path.includes("service") && f.path.endsWith(".jsonld"))!
      .content;
    const doc = JSON.parse(json) as { "@graph": Array<Record<string, unknown>> };
    expect(doc["@graph"].some((n) => n["@type"] === "Service")).toBe(true);
    expect(json).not.toMatch(/"price"\s*:/);
  });

  it("binds FAQPage url/@id to the scanned FAQ page URL when pairs exist", () => {
    const pkg = generateFixPackage(
      {
        domain: "example.com",
        origin: "https://example.com",
        findings: [{ code: "MISSING_FAQ_SCHEMA", passed: false, message: "faq" }],
        pages: [
          {
            url: "https://example.com/help/questions",
            pageType: "faq",
            fetchStatus: "ok",
            hasJsonLd: false,
            evidence: {
              emails: [],
              phones: [],
              sameAs: [],
              faqPairs: [{ question: "How do I start?", answer: "Create an account." }],
              hasSiteSearch: false,
              existingTypes: [],
              existingBlocks: [],
            },
          },
        ],
      },
      {
        faqJsonLd: false,
        llmsTxt: false,
        sitemapXml: false,
        robotsTxt: false,
        pageUrls: ["https://example.com/help/questions"],
      },
    );

    const faq = pkg.files.find((f) => f.path.includes("faq") && f.path.endsWith(".jsonld"))!
      .content;
    const doc = JSON.parse(faq) as Record<string, unknown>;
    expect(doc["@type"]).toBe("FAQPage");
    expect(doc.url).toBe("https://example.com/help/questions");
    expect(doc["@id"]).toBe("https://example.com/help/questions#faq");
    expect(faq).not.toMatch(/TODO_/);
  });

  it("emits Review ItemList for testimonial pages when reviews exist", () => {
    const emptyFacts = {
      emails: [] as string[],
      phones: [] as string[],
      sameAs: [] as string[],
      faqPairs: [] as { question: string; answer: string }[],
      reviews: [] as { author?: string; reviewBody: string }[],
      howtoSteps: [] as { name: string; text: string }[],
      hasSiteSearch: false,
      existingTypes: [] as string[],
      existingBlocks: [] as unknown[],
    };
    const input: FixPackageInput = {
      ...cambridgeInput,
      pages: [
        ...cambridgeInput.pages,
        {
          url: "https://cambridgechamber.com/testimonials",
          pageType: "testimonial",
          fetchStatus: "ok",
          hasJsonLd: false,
          evidence: {
            ...emptyFacts,
            reviews: [
              {
                author: "Pat",
                reviewBody: "Outstanding support for our members every week.",
              },
            ],
          },
        },
      ],
    };
    const pkg = generateFixPackage(input, {
      pageUrls: ["https://cambridgechamber.com/testimonials"],
      llmsTxt: false,
      sitemapXml: false,
      robotsTxt: false,
      faqJsonLd: false,
    });
    const file = pkg.files.find((f) => f.path.includes("testimonial"));
    expect(file).toBeTruthy();
    expect(file!.content).toContain("Review");
    expect(file!.content).toContain("itemReviewed");
    expect(file!.content).not.toMatch(/TODO_/);
    expect(pkg.files.some((f) => f.path === "VALIDATION.md" && f.content.includes("Rich Results"))).toBe(
      true,
    );
  });
});
