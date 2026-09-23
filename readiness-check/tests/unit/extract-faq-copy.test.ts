import { describe, expect, it } from "vitest";
import { extractFaqPairsFromCopy } from "@/lib/facts/extract-faq-copy";

describe("extractFaqPairsFromCopy", () => {
  it("pulls FAQ pairs from markdown headings", () => {
    const pairs = extractFaqPairsFromCopy({
      markdown: `## What is AEO?

Answer Engine Optimization structures content for AI answers.

## How do I start?

Publish clear schema and llms.txt.
`,
    });
    expect(pairs).toEqual([
      {
        question: "What is AEO?",
        answer: "Answer Engine Optimization structures content for AI answers.",
      },
      {
        question: "How do I start?",
        answer: "Publish clear schema and llms.txt.",
      },
    ]);
  });

  it("pulls FAQ pairs from details/summary HTML", () => {
    const pairs = extractFaqPairsFromCopy({
      html: `<details><summary>Do you ship internationally?</summary><p>Yes, to most countries.</p></details>`,
    });
    expect(pairs[0]).toMatchObject({
      question: "Do you ship internationally?",
      answer: "Yes, to most countries.",
    });
  });

  it("caps at 10 pairs", () => {
    const markdown = Array.from({ length: 15 }, (_, i) => `## Question ${i}?\n\nAnswer ${i} is long enough.\n`).join(
      "\n",
    );
    expect(extractFaqPairsFromCopy({ markdown })).toHaveLength(10);
  });
});
