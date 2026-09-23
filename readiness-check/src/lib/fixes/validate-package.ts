import { detectJsonLd } from "@/lib/detect/jsonld";
import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import { analyzeRobots } from "@/lib/detect/robots";
import { parseSitemapUrls } from "@/lib/detect/sitemap";
import type { FixFile } from "./generate-package";

export type ValidationIssue = {
  path: string;
  severity: "error" | "warn" | "info";
  message: string;
};

export type ValidationReport = {
  ok: boolean;
  todoCount: number;
  issues: ValidationIssue[];
};

function countTodos(content: string): number {
  return (content.match(/TODO_/g) ?? []).length;
}

function walkNodes(node: unknown, visit: (obj: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walkNodes(item, visit);
    return;
  }
  const obj = node as Record<string, unknown>;
  visit(obj);
  if (Array.isArray(obj["@graph"])) walkNodes(obj["@graph"], visit);
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkNodes(value, visit);
  }
}

function validateJsonLdFile(path: string, content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    issues.push({ path, severity: "error", message: "JSON.parse failed" });
    return issues;
  }

  const root = parsed as Record<string, unknown>;
  const ctx = root["@context"];
  if (ctx === "http://schema.org" || ctx === "http://schema.org/") {
    issues.push({ path, severity: "error", message: "Use https://schema.org for @context" });
  } else if (ctx !== "https://schema.org" && ctx !== "https://schema.org/") {
    if (!Array.isArray(ctx) || !ctx.includes("https://schema.org")) {
      issues.push({ path, severity: "warn", message: "Missing https://schema.org @context" });
    }
  }

  const detection = detectJsonLd(
    `<script type="application/ld+json">${content}</script>`,
  );
  if (!detection.hasJsonLd) {
    issues.push({ path, severity: "error", message: "No detectable @type in JSON-LD" });
  }

  const ids = new Set<string>();
  walkNodes(parsed, (obj) => {
    if (!obj["@type"] && !obj["@id"] && !obj["@context"]) {
      // ignore leaf objects without type
    } else if (obj["@type"] === undefined && obj["@graph"] === undefined && obj["@context"] === undefined) {
      // skip
    } else if (Array.isArray(obj["@graph"])) {
      for (const node of obj["@graph"]) {
        if (node && typeof node === "object" && !Array.isArray(node)) {
          const n = node as Record<string, unknown>;
          if (!n["@type"]) {
            issues.push({ path, severity: "error", message: "@graph node missing @type" });
          }
        }
      }
    }

    if (typeof obj["@id"] === "string") {
      if (ids.has(obj["@id"])) {
        issues.push({ path, severity: "warn", message: `Duplicate @id ${obj["@id"]}` });
      }
      ids.add(obj["@id"]);
    }

    if (obj["@type"] === "AggregateRating" || (Array.isArray(obj["@type"]) && obj["@type"].includes("AggregateRating"))) {
      issues.push({ path, severity: "error", message: "AggregateRating must not be invented in fix packages" });
    }

    if (obj["@type"] === "SearchAction" || (Array.isArray(obj["@type"]) && obj["@type"].includes("SearchAction"))) {
      const target = obj.target;
      const template =
        typeof target === "string"
          ? target
          : target && typeof target === "object"
            ? String((target as Record<string, unknown>).urlTemplate ?? "")
            : "";
      if (!template.includes("{search_term_string}")) {
        issues.push({
          path,
          severity: "warn",
          message: "SearchAction target should include {search_term_string}",
        });
      }
    }

    if (obj["@type"] === "Review" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Review"))) {
      if (!obj.itemReviewed && !obj.reviewBody) {
        issues.push({ path, severity: "warn", message: "Review should include reviewBody and itemReviewed" });
      } else if (!obj.itemReviewed) {
        issues.push({ path, severity: "warn", message: "Review should include itemReviewed" });
      }
    }
  });

  const types = new Set(detection.schemaTypes);
  const orgLike = [...types].some(
    (t) =>
      t === "Organization" ||
      t === "LocalBusiness" ||
      t === "OnlineStore" ||
      t === "OnlineBusiness" ||
      t.endsWith("Business") ||
      t.endsWith("Organization"),
  );
  if (orgLike) {
    if (!/"name"\s*:/.test(content) || !/"url"\s*:/.test(content)) {
      issues.push({ path, severity: "warn", message: "Organization-like type should include name and url" });
    }
  }
  if (types.has("FAQPage")) {
    if (!/"Question"/.test(content) || !/"acceptedAnswer"/.test(content)) {
      issues.push({ path, severity: "error", message: "FAQPage should include Question + acceptedAnswer" });
    }
  }
  if (types.has("BlogPosting") && !/"headline"\s*:/.test(content)) {
    issues.push({ path, severity: "error", message: "BlogPosting should include headline" });
  }
  if (path.endsWith("home.jsonld")) {
    if (!content.includes("#organization") || !content.includes("#website")) {
      issues.push({
        path,
        severity: "warn",
        message: "Home graph should define #organization and #website @id anchors",
      });
    }
  }
  if (types.has("LocalBusiness") && /"address"\s*:/.test(content)) {
    if (!/"addressLocality"\s*:/.test(content) && !/"streetAddress"\s*:/.test(content)) {
      issues.push({
        path,
        severity: "error",
        message: "LocalBusiness address needs streetAddress or addressLocality",
      });
    }
  }

  for (const match of content.matchAll(/"(url|@id|contentUrl)"\s*:\s*"([^"]+)"/g)) {
    const value = match[2] ?? "";
    if (value.startsWith("#")) continue;
    if (!/^https?:\/\//i.test(value)) {
      issues.push({
        path,
        severity: "warn",
        message: `Non-absolute ${match[1]}: ${value}`,
      });
    }
  }

  return issues;
}

export function validateFixFiles(files: FixFile[]): ValidationReport {
  const issues: ValidationIssue[] = [];
  let todoCount = 0;

  for (const file of files) {
    const todos = countTodos(file.content);
    todoCount += todos;
    if (todos > 0) {
      issues.push({
        path: file.path,
        severity: "error",
        message: `Contains ${todos} TODO_ placeholder(s) — packages must ship zero TODOs`,
      });
    }

    if (file.path.endsWith(".jsonld")) {
      issues.push(...validateJsonLdFile(file.path, file.content));
    }

    if (file.path === "llms.txt" || file.path === "llms-full.txt") {
      const analyzed = analyzeLlmsTxt(file.content);
      if (!analyzed.useful) {
        issues.push({
          path: file.path,
          severity: "warn",
          message: "llms file may not be considered useful (needs http or markdown links)",
        });
      }
    }

    if (file.path === "sitemap.xml") {
      const urls = parseSitemapUrls(file.content);
      if (urls.length === 0) {
        issues.push({ path: file.path, severity: "error", message: "sitemap has no <loc> URLs" });
      }
    }

    if (file.path === "robots.txt") {
      const analyzed = analyzeRobots(file.content);
      if (analyzed.blocksGptBot) {
        issues.push({ path: file.path, severity: "error", message: "robots.txt still blocks GPTBot" });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { ok, todoCount, issues };
}

export function formatValidationMarkdown(
  report: ValidationReport,
  opts?: { origin?: string; pageUrls?: string[] },
): string {
  const lines = [
    "# Fix package validation",
    "",
    `Status: ${report.ok ? "OK (no errors)" : "HAS ERRORS"}`,
    `TODO placeholders remaining: ${report.todoCount}`,
    "",
  ];
  if (report.issues.length === 0) {
    lines.push("No issues found.");
  } else {
    lines.push("## Issues");
    for (const issue of report.issues) {
      lines.push(
        `- **${issue.severity}** ` + "`" + issue.path + "`" + `: ${issue.message}`,
      );
    }
  }

  const pageUrls = opts?.pageUrls?.length ? opts.pageUrls : [];
  if (pageUrls.length || opts?.origin) {
    lines.push("", "## Live validators (deep links)", "");
    lines.push(
      "- Schema.org Validator: https://validator.schema.org/",
      "- Google Rich Results Test: https://search.google.com/test/rich-results",
      "",
    );
    for (const url of pageUrls) {
      const enc = encodeURIComponent(url);
      lines.push(`### ${url}`);
      lines.push(`- Rich Results: https://search.google.com/test/rich-results?url=${enc}`);
      lines.push(`- Schema Markup Validator: https://validator.schema.org/#url=${enc}`);
      lines.push("");
    }
    if (opts?.origin) {
      lines.push(
        "Re-scan with Schema after install: open the public scanner and enter `" +
          opts.origin +
          "`.",
      );
      lines.push("");
    }
  }

  lines.push("");
  return lines.join("\n");
}
