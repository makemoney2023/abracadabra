/**
 * Detect presence/usefulness of llms.txt content.
 * "Useful" aligns with llmstxt.org v2 minimum shape:
 * H1 + blockquote summary + at least one markdown file-list link.
 */
export function analyzeLlmsTxt(content: string | null): {
  present: boolean;
  useful: boolean;
} {
  if (!content || !content.trim()) return { present: false, useful: false };

  const text = content.trim();
  const hasH1 = /^#\s+\S+/m.test(text);
  const hasBlockquote = /^>\s+\S+/m.test(text);
  const hasMdLink = /^-\s+\[[^\]]+\]\(https?:\/\/[^)]+\)/m.test(text);

  return {
    present: true,
    useful: hasH1 && hasBlockquote && hasMdLink,
  };
}
